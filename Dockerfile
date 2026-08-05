# syntax=docker/dockerfile:1
FROM maven:3.9.11-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml mvnw mvnw.cmd ./
COPY .mvn .mvn
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
RUN --mount=type=cache,target=/root/.m2/repository ./mvnw dependency:go-offline -B
COPY src src
RUN --mount=type=cache,target=/root/.m2/repository ./mvnw clean package -DskipTests -B

FROM eclipse-temurin:21-jre
WORKDIR /app/travel-journal
COPY --from=builder /build/target/travel-journal.jar app.jar
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/travel-journal/app.jar"]
