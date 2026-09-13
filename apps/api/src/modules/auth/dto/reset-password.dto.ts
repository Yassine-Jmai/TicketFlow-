import { IsEmail, IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  @Length(8, 100)
  password!: string;
}
