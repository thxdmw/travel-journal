package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.entity.JournalPreviewToken;
import com.thx.traveljournal.journal.mapper.JournalPreviewTokenMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;

/**
 * 草稿预览。
 *
 * <p>公开接口只认已发布日记，所以发布前看不到正文在真实主题和站点外壳下的样子。
 * 这里给草稿签发一个带随机令牌的临时链接：拿到链接的人可以预览，链接会过期，
 * 也可以随时作废，草稿本身始终不进入任何公开列表。</p>
 */
@Service
@RequiredArgsConstructor
public class JournalPreviewService {
    /** 令牌有效期，够发给自己或朋友看一眼即可，不做成长期公开链接 */
    private static final int VALID_HOURS = 48;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JournalPreviewTokenMapper tokenMapper;
    private final JournalService journalService;

    public record PreviewLink(String token, String url, OffsetDateTime expiresAt) {}

    /**
     * 为一篇日记签发预览链接。
     *
     * <p>每次调用都作废该日记之前的令牌，只保留最新一个——旧链接发出去就收不回来了，
     * 重新生成时让旧的立刻失效，语义上更接近用户的预期。</p>
     */
    @Transactional
    public PreviewLink issue(Long journalId) {
        journalService.get(journalId);
        tokenMapper.delete(new LambdaQueryWrapper<JournalPreviewToken>()
                .eq(JournalPreviewToken::getJournalEntryId, journalId));

        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        JournalPreviewToken entity = new JournalPreviewToken();
        entity.setJournalEntryId(journalId);
        entity.setToken(token);
        entity.setExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).plusHours(VALID_HOURS));
        tokenMapper.insert(entity);
        // 前台是 hash 路由，预览页挂在 /#/preview/{token}
        return new PreviewLink(token, "/#/preview/" + token, entity.getExpiresAt());
    }

    /** 作废某篇日记的全部预览链接。 */
    @Transactional
    public void revoke(Long journalId) {
        tokenMapper.delete(new LambdaQueryWrapper<JournalPreviewToken>()
                .eq(JournalPreviewToken::getJournalEntryId, journalId));
    }

    /**
     * 用令牌换取日记。令牌不存在或已过期都按「预览链接无效」处理，
     * 不区分这两种情况，免得泄露令牌是否存在过。
     */
    public JournalEntry resolve(String token) {
        if (!StringUtils.hasText(token)) throw BusinessException.notFound("预览链接无效或已过期");
        JournalPreviewToken entity = tokenMapper.selectOne(new LambdaQueryWrapper<JournalPreviewToken>()
                .eq(JournalPreviewToken::getToken, token).last("limit 1"));
        if (entity == null || entity.getExpiresAt().isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            throw BusinessException.notFound("预览链接无效或已过期");
        }
        return journalService.get(entity.getJournalEntryId());
    }
}
