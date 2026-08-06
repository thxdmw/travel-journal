package com.thx.traveljournal.theme.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.theme.entity.ThemePreset;
import org.apache.ibatis.annotations.Mapper;

/**
 * 主题预设，控制前台的色彩、字体、圆角、布局和图片风格。
 *
 * <p>对应数据库表 {@code theme_preset}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
@Mapper
public interface ThemePresetMapper extends BaseMapper<ThemePreset> {
}
