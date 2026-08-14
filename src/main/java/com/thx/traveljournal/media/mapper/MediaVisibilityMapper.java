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
     *
     * <p>主题封面要同时看 {@code definition_json} 和 {@code override_json}：系统主题的
     * 官方定义不可写回，作者换的首页大图只会落进 override。只查 definition 的话，
     * 这张封面在前台是 403，清理孤儿时还会被当成没人用的图删掉。</p>
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
                and (tp.definition_json @> jsonb_build_object(
                         'hero', jsonb_build_object('mediaId', #{mediaId}))
                  or coalesce(tp.override_json, '{}'::jsonb) @> jsonb_build_object(
                         'hero', jsonb_build_object('mediaId', #{mediaId}))))
        """)
    long countPublishedReferences(@Param("mediaId") Long mediaId);

    /**
     * 统计一张图片被多少个主题用作首页封面（不限是否启用）。
     *
     * <p>清理孤儿图片时用，避免把停用主题还在引用的封面误删。同样要覆盖 override：
     * 系统主题上作者自己换的封面只存在 {@code override_json} 里。</p>
     */
    @Select("""
        select count(*)
          from theme_preset tp
         where tp.definition_json @> jsonb_build_object(
                   'hero', jsonb_build_object('mediaId', #{mediaId}))
            or coalesce(tp.override_json, '{}'::jsonb) @> jsonb_build_object(
                   'hero', jsonb_build_object('mediaId', #{mediaId}))
        """)
    long countThemeHeroReferences(@Param("mediaId") Long mediaId);

    /**
     * 统计一张图片被多少条随手记引用。
     *
     * <p>随手记整理成日记之后，同一张照片会同时挂在 {@code moment_media} 和
     * {@code journal_media} 下。删掉那篇日记时原始的随手记还在，照片不能跟着删——
     * 那是当时按下快门的那一张。</p>
     */
    @Select("select count(*) from moment_media mm where mm.media_asset_id = #{mediaId}")
    long countMomentReferences(@Param("mediaId") Long mediaId);
}
