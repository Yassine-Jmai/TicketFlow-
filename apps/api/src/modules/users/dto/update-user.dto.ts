import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  nom?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  prenom?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000000)
  @Matches(/^(https?:\/\/|data:image\/)/, { message: "photoUrl must be an image URL or image file" })
  photoUrl?: string;

  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  newPassword?: string;
}