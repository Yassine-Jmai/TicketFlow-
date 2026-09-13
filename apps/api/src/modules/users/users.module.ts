import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { EmailModule } from "../email/email.module";

@Module({
  controllers: [UsersController],
  imports: [EmailModule],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
