import { IsString, IsNotEmpty, IsNumber, Min } from "class-validator";

export class CreatePieceJointeDto {
  @IsString()
  @IsNotEmpty()
  nomFichier!: string; // filename

  @IsString()
  @IsNotEmpty()
  chemin!: string; // file path or URL

  @IsString()
  @IsNotEmpty()
  type!: string; // MIME type (e.g., application/pdf, image/png)

  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  taille!: number; // file size in bytes
}
