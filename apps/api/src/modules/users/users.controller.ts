import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

type AuthenticatedRequest = Request & { user: { userId: string } };

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMINISTRATEUR")
  findAll(@Req() request: AuthenticatedRequest) {
    return this.usersService.findAll(request.user.userId);
  }

  @Get("consultants")
  getConsultants() {
    return this.prisma.utilisateur.findMany({
      where: { role: Role.CONSULTANT, deletedAt: null },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        dateCreation: true
      }
    });
  }

  @Get("dev-identities")
  async getDevIdentities() {
    const users = await this.prisma.utilisateur.findMany({
      where: {
        role: { in: [Role.CLIENT, Role.CONSULTANT, Role.ADMINISTRATEUR] },
        deletedAt: null
      },
      orderBy: { dateCreation: "asc" },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        dateCreation: true
      }
    });

    return users.reduce<Partial<Record<Role, (typeof users)[number]>>>((identities, user) => {
      if (!identities[user.role]) identities[user.role] = user;
      return identities;
    }, {});
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
  updateRole(@Param("id") id: string, @Req() request: AuthenticatedRequest, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, request.user.userId, dto);
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMINISTRATEUR")
  delete(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.delete(id, request.user.userId);
  }
}
