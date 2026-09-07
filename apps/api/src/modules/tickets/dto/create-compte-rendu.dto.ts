import { IsString, IsNotEmpty } from "class-validator";

export class CreateCompteRenduDto {
  @IsString()
  @IsNotEmpty()
  contenu!: string;
}
