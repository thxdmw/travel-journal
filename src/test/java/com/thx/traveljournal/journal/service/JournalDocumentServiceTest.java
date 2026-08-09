package com.thx.traveljournal.journal.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;

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
        settings.put("frame", "postcard");
        settings.put("radius", "soft");
        settings.put("tone", "warm");
        settings.put("effect", "lift");
        settings.put("captionPos", "overlay");
        document.withArray("blocks").add(block);

        assertThatCode(() -> service.validate(document, true)).doesNotThrowAnyException();
    }
}
