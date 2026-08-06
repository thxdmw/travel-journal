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
                mock(JournalMapper.class), objectMapper);
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

    @Test
    void createRejectsUnsafeColorValue() throws Exception {
        var definition = objectMapper.readTree("{" +
                "\"colors\":{\"background\":\"url(javascript:alert(1))\"}}" );

        assertThrows(BusinessException.class,
                () -> service.create("危险主题", null, "travel-classic", null, definition, true));
        verify(mapper, never()).insert(any(ThemePreset.class));
    }
}
