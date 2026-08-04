package com.thx.traveljournal.publicapi.controller;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PageControllerTest {

    @Test
    void adminEntryShouldRedirectToStaticIndex() {
        assertThat(new PageController().admin()).isEqualTo("redirect:/admin/index.html");
    }
}
