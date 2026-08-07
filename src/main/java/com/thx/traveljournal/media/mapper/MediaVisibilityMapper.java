package com.thx.traveljournal.media.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 图片可见性与归属查询。
 *
 * <p>这些判断跨了 media、journal、trip 和 theme 四个模块，还要读 jsonb 字段，
 * 用 MyBatis-Plus 的 Lambda 条件表达不方便，单独抽成手写 SQL 的 Mapper。</p>
 */
public interface MediaVisibilityMapper {
    /**
     * 统计一张图片有多少条「已公开」的引用，返回 0 表示访客无权访问。
     *
     * <p>三种情况算公开引用：一是图片挂在已发布的日记下；二是图片是某个旅行的封面，
     * 且这个旅行至少有一篇已发布日记（前台旅行列表本身就只展示这类旅行，
     * 见 PublicContentService#publicTrips）；三是图片被某个启用中的主题用作首页封面。
     * 后两种分别是旅行封面上传和主题封面上传引入的，少了它们前台会拿到 403。</p>
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
          + (select count(*)
               from theme_preset tp
              where tp.enabled = true
                and tp.definition_json @> jsonb_build_object(
                        'hero', jsonb_build_object('mediaId', #{mediaId})))
        """)
    long countPublishedReferences(@Param("mediaId") Long mediaId);

    /**
     * 统计一张图片被多少个主题用作首页封面（不限是否启用）。
     *
     * <p>清理孤儿图片时用，避免把停用主题还在引用的封面误删。</p>
     */
    @Select("""
        select count(*)
          from theme_preset tp
         where tp.definition_json @> jsonb_build_object(
                   'hero', jsonb_build_object('mediaId', #{mediaId}))
        """)
    long countThemeHeroReferences(@Param("mediaId") Long mediaId);
}
