package com.thx.traveljournal.media.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 图片可见性与归属查询。
 *
 * <p>这些判断跨了 media、journal 和 trip 三个模块，用 MyBatis-Plus 的 Lambda 条件表达不方便，
 * 单独抽成手写 SQL 的 Mapper。</p>
 */
public interface MediaVisibilityMapper {
    /**
     * 统计一张图片有多少条「已公开」的引用，返回 0 表示访客无权访问。
     *
     * <p>两种情况算公开引用：一是图片挂在已发布的日记下；二是图片是某个旅行的封面，
     * 且这个旅行至少有一篇已发布日记（前台旅行列表本身就只展示这类旅行，
     * 见 PublicContentService#publicTrips）。第二种情况是旅行封面能直接上传后新增的，
     * 少了它前台旅行卡片的封面图会 403。</p>
     */
    @Select("""
        select
            (select count(*)
               from journal_media jm
               join journal_entry j on j.id = jm.journal_entry_id
              where jm.media_asset_id = #{mediaId} and j.status = 'PUBLISHED')
          + (select count(*)
               from trip t
              where t.cover_media_id = #{mediaId}
                and exists (select 1 from journal_entry j2
                             where j2.trip_id = t.id and j2.status = 'PUBLISHED'))
        """)
    long countPublishedReferences(@Param("mediaId") Long mediaId);
}
