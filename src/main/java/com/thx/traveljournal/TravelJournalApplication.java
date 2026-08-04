package com.thx.traveljournal;

import com.thx.traveljournal.config.AppProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@MapperScan("com.thx.traveljournal")
@EnableConfigurationProperties(AppProperties.class)
public class TravelJournalApplication {
    public static void main(String[] args) {
        SpringApplication.run(TravelJournalApplication.class, args);
    }
}
