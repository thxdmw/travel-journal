package com.thx.traveljournal.moment.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.moment.entity.Moment;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 随手记。
 *
 * <p>对应数据库表 {@code moment}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface MomentMapper extends BaseMapper<Moment> {
    /** 同一旅行的离线创建串行化，保证 client_id 的先查后写没有并发窗口。 */
    @Select("select id from trip where id = #{tripId} for update")
    Long lockTrip(@Param("tripId") Long tripId);

    /** 同一条随手记的离线照片上传串行化，避免重放时重复保存对象。 */
    @Select("select id from moment where id = #{momentId} for update")
    Long lockMoment(@Param("momentId") Long momentId);
}
