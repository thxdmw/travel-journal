package com.thx.traveljournal.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import static org.assertj.core.api.Assertions.assertThat;

class SpaCsrfTokenRequestHandlerTest {

    @Test
    void shouldAcceptRawTokenFromRequestHeader() {
        var token = new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "raw-token");
        var request = new MockHttpServletRequest();
        request.addHeader(token.getHeaderName(), token.getToken());

        String resolved = new SpaCsrfTokenRequestHandler().resolveCsrfTokenValue(request, token);

        assertThat(resolved).isEqualTo("raw-token");
    }
}
