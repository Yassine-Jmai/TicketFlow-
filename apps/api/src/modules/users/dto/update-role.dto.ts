import { IsIn } from "class-validator";

export class UpdateRoleDto {
  @IsIn(["CLIENT", "CONSULTANT"])
  role!: "CLIENT" | "CONSULTANT";
}