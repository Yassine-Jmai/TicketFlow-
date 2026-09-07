import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export enum UserRoleDto {
  CLIENT = "CLIENT",
  CONSULTANT = "CONSULTANT",
  ADMINISTRATEUR = "ADMINISTRATEUR"
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @IsString()
  @IsNotEmpty()
  prenom!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  motDePasse!: string;

  @IsEnum(UserRoleDto)
  @IsOptional()
  role?: UserRoleDto = UserRoleDto.CLIENT;
}
