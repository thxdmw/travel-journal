package com.thx.traveljournal.journal.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 定时回收一直空着的日记草稿。
 *
 * <p>编辑器进页面就先开一篇空草稿，好让作者立刻能拍照和打字，代价是「点进去看一眼
 * 就退出」会留下垃圾记录。这件事必须在服务端按时间做，不能在浏览器退出那一刻做：
 * 退出瞬间最后一次自动保存可能还在路上，那时看到的空正文并不代表作者什么都没写。
 * 宁可库里多留一天的空记录，也不能删掉别人刚写的一段。</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.journal.empty-draft-cleanup", name = "enabled",
        havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class EmptyDraftCleaner {
    /** 静默期。作者在这段时间里随时可能回来接着写，所以不动它。 */
    private static final Duration QUIET_PERIOD = Duration.ofHours(24);

    private final JournalService journalService;

    /**
     * 每小时扫一次。个人站点数据量很小，这里的开销可以忽略。
     *
     * <p>删除逐篇发起而不是整轮一个事务：一篇的图片清理失败就回滚整轮的话，一条坏数据
     * 能让清理永远不生效，而且日志上什么都看不出来。异常一律带堆栈，否则「清理没跑」
     * 这种问题只能靠猜。</p>
     */
    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 300_000L)
    public void purge() {
        OffsetDateTime deadline = JournalService.purgeDeadline(QUIET_PERIOD);
        List<Long> stale;
        try {
            stale = journalService.staleEmptyDraftIds(QUIET_PERIOD);
        } catch (Exception e) {
            log.warn("查询待回收的空白草稿失败，下一轮再试", e);
            return;
        }
        int removed = 0;
        for (Long id : stale) {
            try {
                // 扫描结果只是候选：作者可能在这一轮循环期间回来接着写了，
                // 所以真正的判空和删除放在同一个事务里、锁住行之后再做一次
                if (journalService.deleteIfStillStaleEmpty(id, deadline)) removed++;
            } catch (Exception e) {
                log.warn("回收空白草稿 {} 失败，本轮跳过", id, e);
            }
        }
        if (removed > 0) log.info("已回收 {} 篇超过 24 小时仍然空白的日记草稿", removed);
    }
}
