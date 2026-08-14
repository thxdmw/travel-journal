package com.thx.traveljournal.dashboard.mapper;

import com.thx.traveljournal.dashboard.service.DashboardService.RecentJournal;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 后台首页的聚合查询。
 *
 * <p>这些数字以前是把前 100 条日记读到前端再 filter 出来的：第 101 篇开始统计就不对了，
 * 而且首页每次都要传一批用不上的正文。计数下推给数据库，最近日记只查 6 条。</p>
 */
public interface DashboardMapper {

    @Select("select count(*) from trip")
    long countTrips();

    /** 按状态统计日记篇数。 */
    @Select("select count(*) from journal_entry where status = #{status}")
    long countJournalsByStatus(@Param("status") String status);

    /**
     * 最近编辑的日记，带上所属旅行标题。
     *
     * <p>left join 一次拿到旅行标题，不再「先查 100 个旅行再在前端配对」，也不按篇数
     * 逐条查旅行。旅行为空或已被删除时 tripTitle 为 null，由上层降级成「独立日记」。</p>
     */
    @Select("""
        select j.id, j.title, j.occurred_on, j.status, j.updated_at, t.title as trip_title
          from journal_entry j
          left join trip t on t.id = j.trip_id
         order by j.updated_at desc
         limit #{limit}
        """)
    List<RecentJournal> recentJournals(@Param("limit") int limit);
}
