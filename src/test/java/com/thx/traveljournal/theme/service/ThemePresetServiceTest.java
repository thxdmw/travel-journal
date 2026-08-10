package com.thx.traveljournal.theme.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.theme.entity.ThemePreset;
import com.thx.traveljournal.theme.mapper.ThemePresetMapper;
import com.thx.traveljournal.trip.mapper.TripMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ThemePresetServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private ThemePresetMapper mapper;
    private ThemePresetService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ThemePresetMapper.class);
        service = new ThemePresetService(mapper, mock(AdminUserMapper.class), mock(TripMapper.class),
                mock(JournalMapper.class), objectMapper, mock(SeasonService.class));
        doAnswer(invocation -> {
            ((ThemePreset) invocation.getArgument(0)).setId(9L);
            return 1;
        }).when(mapper).insert(any(ThemePreset.class));
    }

    @Test
    void createKeepsOnlyControlledThemeTokens() throws Exception {
        var definition = objectMapper.readTree("""
                {"colors":{"background":"#f7f2e8","primary":"#264A3D","unknown":"red"},
                 "typography":{"bodySize":30},"script":"alert(1)"}
                """);

        var result = service.create("我的主题", "说明", "travel-classic", null, definition, true);

        assertEquals(9L, result.id());
        assertEquals("#F7F2E8", result.definitionJson().path("colors").path("background").asText());
        assertFalse(result.definitionJson().path("colors").has("unknown"));
        assertFalse(result.definitionJson().has("script"));
        assertEquals(22, result.definitionJson().path("typography").path("bodySize").asInt());
        verify(mapper).insert(any(ThemePreset.class));
    }

    /**
     * 贴纸只认白名单里的位置和形如 spring-sakura 的素材名。
     *
     * <p>这两个值一个会拼进 SVG 的 URL、一个会变成 CSS 类名，所以路径穿越和绝对坐标
     * 都必须挡在服务端。不认识的项直接丢掉而不是整条报错——导入一份为新版本写的主题时，
     * 旧版本应该照常能用，只是少几张贴纸。</p>
     */
    @Test
    void createKeepsOnlyWhitelistedStickers() throws Exception {
        var definition = objectMapper.readTree("""
                {"stickers":{"density":"low","items":[
                  {"asset":"spring-sakura","area":"hero-right"},
                  {"asset":"../../etc/passwd","area":"hero-left"},
                  {"asset":"summer-sun","area":"left:1782px"},
                  {"asset":"summer-wave","area":"footer"}]}}
                """);

        var result = service.create("贴纸主题", null, "travel-classic", null, definition, true);

        var items = result.definitionJson().path("stickers").path("items");
        assertEquals(2, items.size());
        assertEquals("spring-sakura", items.get(0).path("asset").asText());
        assertEquals("summer-wave", items.get(1).path("asset").asText());
    }

    /** 互动只收枚举。主题是可以导入导出的 JSON，允许里面出现代码就等于允许执行别人的脚本。 */
    @Test
    void createDropsScriptFromInteractions() throws Exception {
        var definition = objectMapper.readTree("""
                {"interactions":{"stickerClick":"pop","imageHover":"javascript:alert(1)",
                                 "onclick":"steal()","heroEntrance":"float"}}
                """);

        var result = service.create("互动主题", null, "travel-classic", null, definition, true);

        var interactions = result.definitionJson().path("interactions");
        assertEquals("pop", interactions.path("stickerClick").asText());
        // 不认识的枚举值退回默认，而不是原样存下来
        assertEquals("none", interactions.path("imageHover").asText());
        assertFalse(interactions.has("onclick"));
    }

    @Test
    void createRejectsUnsafeColorValue() throws Exception {
        var definition = objectMapper.readTree("{" +
                "\"colors\":{\"background\":\"url(javascript:alert(1))\"}}" );

        assertThrows(BusinessException.class,
                () -> service.create("危险主题", null, "travel-classic", null, definition, true));
        verify(mapper, never()).insert(any(ThemePreset.class));
    }
}
