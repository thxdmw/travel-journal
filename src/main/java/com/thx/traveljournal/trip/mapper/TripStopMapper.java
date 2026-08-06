package com.thx.traveljournal.trip.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.trip.entity.TripStop;
/**
 * 旅行途经的城市或地点，同时提供前台地图上的坐标点。
 *
 * <p>对应数据库表 {@code trip_stop}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface TripStopMapper extends BaseMapper<TripStop> {}
