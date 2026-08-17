package com.thx.traveljournal.media.service;

import org.springframework.beans.factory.ObjectProvider;

/**
 * 单测里给 MediaService 的「自身代理」替身。
 *
 * <p>生产环境注入的是 Spring 代理，用来让上传的落库那一小段真正走事务；单测里没有代理，
 * 直接返回同一个实例即可——事务注解在纯 mock 单测中本来也不生效。</p>
 */
final class SelfProviders {
    private SelfProviders() {}

    /** 返回一个总是给出 {@code holder[0]} 的 provider，便于在构造完成后回填自身。 */
    static ObjectProvider<MediaService> of(MediaService[] holder) {
        return new ObjectProvider<>() {
            @Override
            public MediaService getObject() {
                return holder[0];
            }

            @Override
            public MediaService getObject(Object... args) {
                return holder[0];
            }

            @Override
            public MediaService getIfAvailable() {
                return holder[0];
            }

            @Override
            public MediaService getIfUnique() {
                return holder[0];
            }
        };
    }
}
