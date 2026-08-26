import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsUUID, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@interview-assistant/shared';

export class LoginDto {
  @ApiProperty({ example: 'admin@vcs.com or FL000001' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  login: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RequestInternalPasswordDto {
  @ApiProperty({ example: 'employee@viettel.com.vn' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh_token_value' })
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ example: 'refresh_token_value' })
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}

export class CreateEvaluationHandoffDto {
  @ApiProperty({ example: '296d2881-c294-4eb5-a30a-be781f843c99' })
  @IsUUID()
  applicationId: string;
}

export class ExchangeEvaluationHandoffDto {
  @ApiProperty({ example: 'eh_opaque_one_time_token' })
  @IsString()
  @MinLength(20)
  handoffToken: string;

  @ApiProperty({ example: '296d2881-c294-4eb5-a30a-be781f843c99' })
  @IsUUID()
  applicationId: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @MinLength(6)
  confirmPassword: string;
}

export class RequestPasswordResetDto {
  @IsString()
  @MinLength(1)
  login: string;
}

export class VerifyPasswordResetDto {
  @IsUUID()
  challengeId: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;
}

export class CompletePasswordResetDto {
  @IsString()
  @MinLength(20)
  resetToken: string;

  @ApiProperty({ example: 'NewPassword@123' })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ example: 'NewPassword@123' })
  @IsString()
  @MinLength(6)
  confirmPassword: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'admin@vcs.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

}

export class CreateUserDto {
  @ApiProperty({ example: 'interviewer@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.INTERVIEWER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
