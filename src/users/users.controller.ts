import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MovementsQueryDto } from './movements-query.dto';
import { UpdateUserDto } from './update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ description: 'User details' })
  @ApiNotFoundResponse({ description: 'User not found' })
  findOne(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.users.findOne(userId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update editable personal information' })
  @ApiOkResponse({ description: 'Updated user' })
  @ApiBadRequestResponse({ description: 'Invalid or forbidden fields' })
  update(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(userId, dto);
  }

  @Get(':userId/movements')
  @ApiOperation({ summary: 'List recent cash movements and stock orders' })
  @ApiOkResponse({ description: 'Deterministically ordered movements' })
  movements(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query() query: MovementsQueryDto,
  ) {
    return this.users.movements(userId, query.limit);
  }
}
