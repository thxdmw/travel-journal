package com.thx.traveljournal.moment.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.moment.entity.Moment;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

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

    /**
     * 锁住一次旅行名下的全部随手记。
     *
     * <p>删除旅行时先用它把这些行锁住，再统计照片、再删除。锁 trip 行是不够的：照片上传
     * 走的是 {@link #lockMoment}，它只认 moment 这一行，完全看不见 trip 上的锁。于是：</p>
     *
     * <pre>
     * 删除旅行：锁住 trip，查出随手记 1 现有的照片 [100, 101]
     * 上传线程：锁住随手记 1，插入照片 102，提交
     * 删除旅行：删掉随手记 1 和它的关系行，但只回收看到过的 [100, 101]
     *          → 102 连同它在对象存储里的四个文件，再也没有任何东西引用得到
     * </pre>
     *
     * <p>锁同一批 moment 行，两条路径才在同一套协议上。</p>
     */
    @Select("select id from moment where trip_id = #{tripId} for update")
    List<Long> lockTripMoments(@Param("tripId") Long tripId);
}
