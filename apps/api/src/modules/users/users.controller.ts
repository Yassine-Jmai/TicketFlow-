// users.controller.ts
import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

type AuthenticatedRequest = Request & { user: { userId: string } };

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMINISTRATEUR")
  findAll(@Query("role") role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put("me")
  @UseGuards(AuthGuard("jwt"))
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateUserDto) {
    return this.usersService.update(request.user.userId, dto);
  }

  @Put(":id/role")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMINISTRATEUR")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  updateRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto);
  }
}