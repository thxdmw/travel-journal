package com.thx.traveljournal.theme.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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

    /** 造一份和真实 builtin 种子数据同构的官方 definitionJson：全部 SCHEMA 字段都被填满默认值。 */
    private JsonNode officialBaseline(String overrides) throws Exception {
        return service.create("官方基线", null, "travel-classic", null, objectMapper.readTree(overrides), true)
                .definitionJson();
    }

    private ThemePreset builtinPreset(Long id, JsonNode definitionJson) {
        ThemePreset preset = new ThemePreset();
        preset.setId(id);
        preset.setThemeKey("preset-summer");
        preset.setName("盛夏出逃");
        preset.setDescription("官方预设");
        preset.setBaseThemeKey("travel-classic");
        preset.setBuiltin(true);
        preset.setEnabled(true);
        preset.setVersion(3);
        preset.setDefinitionJson(definitionJson);
        return preset;
    }

    /**
     * 系统主题现在可以直接设计：不再抛异常拒绝，官方 definitionJson 也不会被写回，
     * 修改只以稀疏 override 的形式单独保存，且名称/说明这些官方身份信息不接受这个入口改写。
     */
    @Test
    void updateAllowsEditingBuiltinThemeAndStoresSparseOverride() throws Exception {
        JsonNode official = officialBaseline("{\"colors\":{\"accent\":\"#2E9BC9\"}}");
        ThemePreset preset = builtinPreset(5L, official);
        when(mapper.selectById(5L)).thenReturn(preset);

        // 设计器提交的是完整表单（等于当前生效值），只有强调色被真的改过
        ObjectNode submitted = official.deepCopy();
        ((ObjectNode) submitted.get("colors")).put("accent", "#EE873F");

        var result = service.update(5L, "改名字也不会生效", "改说明也不会生效", "travel-classic", null, submitted, true);

        assertEquals("#2E9BC9", preset.getDefinitionJson().path("colors").path("accent").asText(),
                "官方 definitionJson 不能被写回");
        assertEquals("盛夏出逃", result.name(), "系统主题名称保持官方原样");
        assertNotNull(preset.getOverrideJson());
        assertEquals("#EE873F", preset.getOverrideJson().path("colors").path("accent").asText());
        assertFalse(preset.getOverrideJson().path("colors").has("background"), "没变化的字段不进 override");
        assertEquals(1, result.customizedCount());
        assertEquals("#EE873F", result.definitionJson().path("colors").path("accent").asText(),
                "对外看到的 definitionJson 是 merge 之后的生效值");
        assertTrue(result.builtin());
        verify(mapper).updateById(preset);
    }

    /** 前端为了渲染控件补出的 fallback 不应变成覆盖；只采纳 changedPaths 指定的真实操作项。 */
    @Test
    void updateBuiltinUsesTouchedPathsInsteadOfSavingFrontendFallbacks() throws Exception {
        JsonNode official = objectMapper.readTree("""
                {"colors":{"accent":"#2E9BC9"},"layout":{"articleWidth":760}}
                """);
        ThemePreset preset = builtinPreset(5L, official);
        when(mapper.selectById(5L)).thenReturn(preset);

        JsonNode submitted = objectMapper.readTree("""
                {"colors":{"accent":"#EE873F","background":"#F7F2E8"},
                 "layout":{"articleWidth":760,"contentWidth":1200},
                 "gallery":{"layout":"grid","columns":3}}
                """);

        var result = service.update(5L, "盛夏出逃", null, "travel-classic", null,
                submitted, true, java.util.List.of("colors.accent"));

        assertEquals("#EE873F", result.overrideJson().path("colors").path("accent").asText());
        assertFalse(result.overrideJson().path("colors").has("background"));
        assertFalse(result.overrideJson().has("layout"));
        assertFalse(result.overrideJson().has("gallery"));
        assertEquals(1, result.customizedCount());
    }

    /** 提交内容和官方值完全一致时，override 应该是空的，不产生「已自定义 0 项」这种噪音。 */
    @Test
    void updateProducesNoOverrideWhenSubmittedEqualsOfficial() throws Exception {
        JsonNode official = officialBaseline("{\"colors\":{\"accent\":\"#2E9BC9\"}}");
        ThemePreset preset = builtinPreset(5L, official);
        when(mapper.selectById(5L)).thenReturn(preset);

        var result = service.update(5L, "无所谓", null, "travel-classic", null, official.deepCopy(), true);

        assertNull(preset.getOverrideJson());
        assertEquals(0, result.customizedCount());
    }

    /** 个人主题不受影响：继续直接改写 definitionJson，不涉及 override。 */
    @Test
    void updateStillEditsCustomThemeDefinitionDirectly() throws Exception {
        ThemePreset preset = new ThemePreset();
        preset.setId(11L);
        preset.setThemeKey("custom-abc123");
        preset.setName("旧名字");
        preset.setBaseThemeKey("travel-classic");
        preset.setBuiltin(false);
        preset.setEnabled(true);
        preset.setVersion(1);
        preset.setDefinitionJson(objectMapper.readTree("{\"colors\":{\"accent\":\"#2E9BC9\"}}"));
        when(mapper.selectById(11L)).thenReturn(preset);

        var submitted = objectMapper.readTree("{\"colors\":{\"accent\":\"#EE873F\"}}");
        var result = service.update(11L, "新名字", "新说明", "travel-classic", null, submitted, true);

        assertEquals("新名字", result.name());
        assertEquals("#EE873F", preset.getDefinitionJson().path("colors").path("accent").asText());
        assertNull(preset.getOverrideJson());
        assertFalse(result.builtin());
        assertEquals(0, result.customizedCount());
    }

    /** 还原默认：清空 override，effective 自然回到官方值。 */
    @Test
    void resetOverrideClearsCustomizationAndRevertsToOfficialValue() throws Exception {
        JsonNode official = officialBaseline("{\"colors\":{\"accent\":\"#2E9BC9\"}}");
        ThemePreset preset = builtinPreset(6L, official);
        preset.setOverrideJson(objectMapper.readTree("{\"colors\":{\"accent\":\"#EE873F\"}}"));
        when(mapper.selectById(6L)).thenReturn(preset);

        var result = service.resetOverride(6L);

        assertNull(preset.getOverrideJson());
        assertEquals(0, result.customizedCount());
        assertEquals("#2E9BC9", result.definitionJson().path("colors").path("accent").asText());
        verify(mapper).updateById(preset);
    }

    @Test
    void resetOverrideRejectsCustomTheme() throws Exception {
        ThemePreset preset = new ThemePreset();
        preset.setId(7L);
        preset.setBuiltin(false);
        preset.setDefinitionJson(objectMapper.readTree("{}"));
        when(mapper.selectById(7L)).thenReturn(preset);

        assertThrows(BusinessException.class, () -> service.resetOverride(7L));
    }

    /** 复制系统主题时应该复制生效值（官方 + 覆盖 merge 之后），而不是裸官方值。 */
    @Test
    void duplicateCopiesEffectiveValueForCustomizedBuiltinTheme() throws Exception {
        JsonNode official = officialBaseline("{\"colors\":{\"accent\":\"#2E9BC9\"}}");
        ThemePreset preset = builtinPreset(8L, official);
        preset.setOverrideJson(objectMapper.readTree("{\"colors\":{\"accent\":\"#EE873F\"}}"));
        when(mapper.selectById(8L)).thenReturn(preset);

        var result = service.duplicate(8L);

        assertEquals("盛夏出逃 · 副本", result.name());
        assertFalse(result.builtin());
        assertEquals("#EE873F", result.definitionJson().path("colors").path("accent").asText(),
                "复制的是生效值，不是裸官方值");
    }
}
