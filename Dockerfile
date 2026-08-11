# syntax=docker/dockerfile:1
FROM maven:3.9.11-eclipse-temurin-21 AS builder

# 配置阿里云 Maven 镜像加速
RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml << 'EOF'
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">
  <mirrors>
    <mirror>
      <id>aliyun-public</id>
      <mirrorOf>*</mirrorOf>
      <name>Aliyun Public Mirror</name>
      <url>https://maven.aliyun.com/repository/public</url>
    </mirror>
  </mirrors>
</settings>
EOF

WORKDIR /build

# 复制 pom.xml 文件
COPY pom.xml .

# 预下载依赖，利用 BuildKit 缓存
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn dependency:go-offline -B -ntp -s /root/.m2/settings.xml

# 复制源代码
COPY src ./src

# 构建项目
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn package -B -ntp -s /root/.m2/settings.xml

# ============================
# 第二阶段：运行阶段
# ============================
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app/travel-journal
COPY --from=builder /build/target/travel-journal.jar app.jar
# EXPOSE 只声明镜像默认端口；host 网络下的实际监听端口仍由 SERVER_PORT 决定。
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/travel-journal/app.jar"]
