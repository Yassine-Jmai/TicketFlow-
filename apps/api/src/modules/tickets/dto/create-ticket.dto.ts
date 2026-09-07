import { IsString, IsNotEmpty, IsEnum, IsOptional } from "class-validator";
import { Priorite } from "@prisma/client";

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  moduleId!: string;

  @IsString()
  @IsNotEmpty()
  objet!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(Priorite)
  @IsOptional()
  priorite?: Priorite = Priorite.MOYENNE;
}
