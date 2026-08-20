package com.thx.traveljournal.journal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class JournalDocumentServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JournalDocumentService service = new JournalDocumentService(objectMapper);

    @Test
    void expandedContentBlocksShouldBeAccepted() {
        ObjectNode document = service.emptyDocument();
        List<String> types = List.of(
                "callout", "facts", "pros-cons", "table", "link-card", "stats", "companions",
                "location-card", "food", "stay", "transport", "weather");
        for (int index = 0; index < types.size(); index++) {
            ObjectNode block = objectMapper.createObjectNode();
            block.put("id", "block_expanded_" + index);
            block.put("type", types.get(index));
            block.put("version", 1);
            block.putObject("data");
            block.putObject("settings");
            document.withArray("blocks").add(block);
        }

        assertThatCode(() -> service.validate(document, false)).doesNotThrowAnyException();
    }

    @Test
    void detailedImageAppearanceSettingsShouldBeAccepted() {
        ObjectNode document = service.emptyDocument();
        ObjectNode block = objectMapper.createObjectNode();
        block.put("id", "block_image_settings");
        block.put("type", "image");
        block.put("version", 1);
        block.putObject("data").put("mediaId", 7L);
        ObjectNode settings = block.putObject("settings");
        settings.put("size", "full");
        settings.put("align", "center");
        settings.put("ratio", "4x3");
        settings.put("frame", "film");
        settings.put("radius", "soft");
        settings.put("effect", "lift");
        settings.put("captionPos", "side");
        document.withArray("blocks").add(block);

        assertThatCode(() -> service.validate(document, true)).doesNotThrowAnyException();
    }

    /**
     * 下线掉的版式不能直接 400。
     *
     * <p>作者浏览器 IndexedDB 里的本机草稿快照 Flyway 迁移够不着，那份快照回来时带的仍是
     * 通栏出血、瀑布流这些旧值。拒收会让自动保存一路失败，所以这里搬到保留集合里再校验。</p>
     */
    @Test
    void retiredImageSettingsShouldBeMigratedInsteadOfRejected() {
        ObjectNode document = service.emptyDocument();
        ObjectNode block = objectMapper.createObjectNode();
        block.put("id", "block_retired_settings");
        block.put("type", "gallery");
        block.put("version", 1);
        block.putObject("data").withArray("mediaIds").add(7L);
        ObjectNode settings = block.putObject("settings");
        settings.put("size", "bleed");
        settings.put("layout", "masonry");
        settings.put("frame", "polaroid");
        settings.put("tone", "vintage");
        settings.put("captionPos", "overlay");
        document.withArray("blocks").add(block);

        JsonNode migrated = service.validate(document, true).path("blocks").path(0).path("settings");

        assertThat(migrated.path("size").asText()).isEqualTo("full");
        assertThat(migrated.path("layout").asText()).isEqualTo("grid");
        assertThat(migrated.path("frame").asText()).isEqualTo("none");
        assertThat(migrated.path("captionPos").asText()).isEmpty();
        assertThat(migrated.has("tone")).isFalse();
    }
}
