package com.thx.traveljournal.support;

import org.springframework.beans.factory.ObjectProvider;

/**
 * 单测里给「自身代理」字段的替身。
 *
 * <p>生产环境注入的是 Spring 代理，服务用它调自己那些带 {@code @Transactional} 的方法；
 * 纯 mock 单测里没有容器，也就没有事务，直接返回同一个实例即可。</p>
 *
 * <p>用数组做持有者是因为「服务需要指向自己的 provider」这件事在构造期是个鸡生蛋问题：
 * 先建 provider，构造完再把实例回填进去。</p>
 */
public final class SelfProvider {
    private SelfProvider() {}

    /** 返回一个总是给出 {@code holder[0]} 的 provider，便于在构造完成后回填自身。 */
    public static <T> ObjectProvider<T> of(T[] holder) {
        return new ObjectProvider<>() {
            @Override
            public T getObject() {
                return holder[0];
            }

            @Override
            public T getObject(Object... args) {
                return holder[0];
            }

            @Override
            public T getIfAvailable() {
                return holder[0];
            }

            @Override
            public T getIfUnique() {
                return holder[0];
            }
        };
    }
}
