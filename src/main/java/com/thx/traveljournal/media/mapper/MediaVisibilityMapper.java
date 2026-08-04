package com.thx.traveljournal.media.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface MediaVisibilityMapper {
    @Select("""
        select count(*)
        from journal_media jm
        join journal_entry j on j.id = jm.journal_entry_id
        where jm.media_asset_id = #{mediaId} and j.status = 'PUBLISHED'
        """)
    long countPublishedReferences(@Param("mediaId") Long mediaId);
}
