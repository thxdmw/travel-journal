package com.thx.traveljournal.trip.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.trip.entity.Trip;
/**
 * 一次旅行，是城市、行程、预算、支出和日记的归属主体。
 *
 * <p>对应数据库表 {@code trip}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface TripMapper extends BaseMapper<Trip> {}
