package com.thx.traveljournal.auth.controller;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthControllerSessionTest {
    @Test
    void anonymousSessionShouldReturnSuccessWithNullUser() {
        AuthController controller = new AuthController(null, null, null, null, null, null);

        var response = controller.session(null);

        assertThat(response.code()).isEqualTo("OK");
        assertThat(response.data()).isNull();
    }
}
