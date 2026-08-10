package com.thx.traveljournal;

import com.thx.traveljournal.config.AppProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 应用入口。个人旅行日记系统，前台公开展示，后台单管理员维护。 */
@SpringBootApplication
@MapperScan("com.thx.traveljournal")
@EnableConfigurationProperties(AppProperties.class)
@EnableScheduling
public class TravelJournalApplication {
    public static void main(String[] args) {
        SpringApplication.run(TravelJournalApplication.class, args);
    }
}
