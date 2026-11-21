import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';
import { UpdatePortfolioDto } from './update-portfolio.dto';

@ApiTags('Portfolios')
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Get(':portfolioId')
  @ApiOperation({ summary: 'Get portfolio metadata and cash balance' })
  findOne(
    @Param('portfolioId', new ParseUUIDPipe({ version: '4' }))
    portfolioId: string,
  ) {
    return this.portfolios.findOne(portfolioId);
  }

  @Patch(':portfolioId')
  @ApiOperation({ summary: 'Update editable portfolio metadata' })
  @ApiOkResponse({ description: 'Updated portfolio' })
  @ApiBadRequestResponse({ description: 'Invalid or forbidden fields' })
  update(
    @Param('portfolioId', new ParseUUIDPipe({ version: '4' }))
    portfolioId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolios.update(portfolioId, dto);
  }

  @Get(':portfolioId/valuation')
  @ApiOperation({ summary: 'Calculate portfolio value at current prices' })
  valuation(
    @Param('portfolioId', new ParseUUIDPipe({ version: '4' }))
    portfolioId: string,
  ) {
    return this.portfolios.valuation(portfolioId);
  }
}
