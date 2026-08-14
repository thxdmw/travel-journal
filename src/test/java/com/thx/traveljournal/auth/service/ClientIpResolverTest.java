package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 登录限流按 IP 计数，所以「这个 IP 是谁说的」直接决定限流能不能被绕过。
 */
class ClientIpResolverTest {

    private ClientIpResolver resolver(String trustedProxies) {
        return new ClientIpResolver(new AppProperties(null, null, null, null, null, null, null,
                new AppProperties.Security(trustedProxies)));
    }

    private MockHttpServletRequest request(String remoteAddr, String forwarded) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        if (forwarded != null) request.addHeader("X-Forwarded-For", forwarded);
        return request;
    }

    @Test
    void forgedForwardedHeaderIsIgnoredWhenThereIsNoTrustedProxy() {
        // 没配代理时这个头完全由客户端自己填，采信它等于让限流形同虚设
        assertThat(resolver("").resolve(request("203.0.113.9", "1.2.3.4")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void forwardedHeaderFromAnUnknownPeerIsIgnored() {
        assertThat(resolver("10.0.0.1").resolve(request("203.0.113.9", "1.2.3.4")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void trustedProxyHandsOverTheRealClient() {
        assertThat(resolver("10.0.0.1").resolve(request("10.0.0.1", "203.0.113.9")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void onlyTheHopClosestToUsIsTrusted() {
        // 左边那几段是客户端可以随便伪造的，取最右边一个非代理地址
        assertThat(resolver("10.0.0.1,10.0.0.2").resolve(
                request("10.0.0.1", "1.2.3.4, 203.0.113.9, 10.0.0.2")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void trustedProxyWithoutTheHeaderFallsBackToTheDirectPeer() {
        assertThat(resolver("10.0.0.1").resolve(request("10.0.0.1", null)))
                .isEqualTo("10.0.0.1");
    }
}
