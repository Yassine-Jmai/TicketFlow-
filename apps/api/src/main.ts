import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as express from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.use(express.json({ limit: "10mb" }));
  httpServer.use(express.urlencoded({ limit: "10mb", extended: true }));

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
