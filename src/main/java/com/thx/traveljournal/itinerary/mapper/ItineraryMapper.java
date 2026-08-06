package com.thx.traveljournal.itinerary.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
/**
 * 按天安排的行程条目，例如交通、住宿、景点。
 *
 * <p>对应数据库表 {@code itinerary_item}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface ItineraryMapper extends BaseMapper<ItineraryItem> {}
