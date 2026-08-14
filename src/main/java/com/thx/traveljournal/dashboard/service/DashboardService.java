package com.thx.traveljournal.dashboard.service;

import com.thx.traveljournal.dashboard.mapper.DashboardMapper;
import com.thx.traveljournal.theme.service.ThemePresetService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 后台首页数据。
 *
 * <p>只服务于「管理首页」这一个界面，所以单独一套精简 DTO：不复用公开日记接口，
 * 免得为了首页那几行字把公开响应越撑越大。</p>
 */
@Service
@RequiredArgsConstructor
public class DashboardService {
    /** 最近编辑列表的长度。首页是入口不是列表页，多了反而看不过来。 */
    private static final int RECENT_LIMIT = 6;

    private final DashboardMapper mapper;
    private final ThemePresetService themePresetService;

    /**
     * 首页概览。
     *
     * @param trips     旅行总数
     * @param drafts    草稿总数
     * @param published 已发布总数
     * @param themeName 当前实际生效的全站主题名
     * @param recent    最近编辑的日记
     */
    public record DashboardView(long trips, long drafts, long published, String themeName,
                                List<RecentJournal> recent) {}

    /**
     * 最近编辑列表里的一行。
     *
     * <p>MyBatis 需要无参构造和 setter 才能自动映射，所以这里用类而不是 record。</p>
     */
    @Data
    public static class RecentJournal {
        private Long id;
        private String title;
        /** 所属旅行标题；独立日记或旅行已删除时为 null */
        private String tripTitle;
        private LocalDate occurredOn;
        private String status;
        private OffsetDateTime updatedAt;
    }

    public DashboardView overview() {
        List<RecentJournal> recent = mapper.recentJournals(RECENT_LIMIT);
        return new DashboardView(
                mapper.countTrips(),
                mapper.countJournalsByStatus("DRAFT"),
                mapper.countJournalsByStatus("PUBLISHED"),
                themePresetService.activeSiteTheme().name(),
                recent);
    }
}
