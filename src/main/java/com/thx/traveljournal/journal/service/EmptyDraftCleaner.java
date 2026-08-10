package com.thx.traveljournal.journal.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

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

    /** 每小时扫一次。个人站点数据量很小，这里的开销可以忽略。 */
    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 300_000L)
    public void purge() {
        try {
            int removed = journalService.purgeStaleEmptyDrafts(QUIET_PERIOD);
            if (removed > 0) log.info("已回收 {} 篇超过 24 小时仍然空白的日记草稿", removed);
        } catch (Exception e) {
            // 清理失败不该影响正常使用，下一轮再试
            log.warn("回收空白草稿失败：{}", e.getMessage());
        }
    }
}
