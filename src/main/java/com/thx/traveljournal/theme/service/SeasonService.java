package com.thx.traveljournal.theme.service;

import com.thx.traveljournal.common.util.SiteClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 判断站点「现在是什么季节」，供跟随季节的全站主题使用。
 *
 * <p>关键在于按站点时区算，而不是访客设备的时间。这是一个人的旅行站，
 * 用 {@code new Date()} 的话东京的访客看到夏、悉尼的访客看到冬，同一天里
 * 同一个站点会长成两个样子。时区由 {@code app.site.timezone} 配置。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeasonService {
    /** 四季标识，同时也是对应季节主题的名字后缀。 */
    public enum Season {
        SPRING("春", "preset-spring"),
        SUMMER("夏", "preset-summer"),
        AUTUMN("秋", "preset-autumn"),
        WINTER("冬", "preset-winter");

        private final String label;
        private final String themeKey;

        Season(String label, String themeKey) {
            this.label = label;
            this.themeKey = themeKey;
        }

        public String label() { return label; }
        public String themeKey() { return themeKey; }
    }

    /** 月份到季节。3–5 春、6–8 夏、9–11 秋、12–2 冬，取的是气象上的常规划分。 */
    private static final Map<Integer, Season> BY_MONTH = Map.ofEntries(
            Map.entry(3, Season.SPRING), Map.entry(4, Season.SPRING), Map.entry(5, Season.SPRING),
            Map.entry(6, Season.SUMMER), Map.entry(7, Season.SUMMER), Map.entry(8, Season.SUMMER),
            Map.entry(9, Season.AUTUMN), Map.entry(10, Season.AUTUMN), Map.entry(11, Season.AUTUMN),
            Map.entry(12, Season.WINTER), Map.entry(1, Season.WINTER), Map.entry(2, Season.WINTER));

    private final SiteClock clock;

    /** 站点时区下的当前季节。 */
    public Season current() {
        return BY_MONTH.get(clock.today().getMonthValue());
    }

    /** 当前季节对应的主题标识。 */
    public String currentThemeKey() {
        return current().themeKey();
    }
}
