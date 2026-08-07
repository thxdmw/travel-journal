package com.thx.traveljournal.publicapi.mapper;

import org.apache.ibatis.annotations.MapKey;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 前台聚合统计。
 *
 * <p>这些数字原先是把全部已发布日记读进内存再用 stream 算出来的，日记攒多了会白读
 * 一大堆正文。这里全部下推成 SQL 聚合，应用侧只拿回几行结果。</p>
 */
public interface PublicAggregateMapper {

    /** 已发布日记的照片总数。 */
    @Select("""
        select count(*)
          from journal_media jm
          join journal_entry j on j.id = jm.journal_entry_id
         where j.status = 'PUBLISHED'
        """)
    long countPublishedPhotos();

    /** 已发布日记总数。 */
    @Select("select count(*) from journal_entry where status = 'PUBLISHED'")
    long countPublishedJournals();

    /**
     * 每个旅行下已发布日记的篇数，只返回有已发布日记的旅行。
     *
     * @return key 是 trip_id，value 里的 {@code cnt} 是篇数
     */
    @MapKey("trip_id")
    @Select("""
        select j.trip_id, count(*) as cnt
          from journal_entry j
         where j.status = 'PUBLISHED'
         group by j.trip_id
        """)
    List<Map<String, Object>> countPublishedByTrip();
}
