import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MinLength, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/auth';
import { ClientsService } from './clients.service';

const STATUTS = ['prospect', 'qualifie', 'confirme'] as const;
type Statut = (typeof STATUTS)[number];

class CreateClientDto {
  @IsString() @MinLength(1) nom!: string;
  @IsString() @MinLength(1) prenom!: string;
  @IsOptional() @IsString() adresse?: string;
  @IsEmail({}, { message: 'E-mail invalide' }) email!: string;
  @IsString() @MinLength(3, { message: 'Téléphone requis' }) telephone!: string;
  @IsOptional() @IsIn(STATUTS) statut?: Statut;
}

class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) nom?: string;
  @IsOptional() @IsString() @MinLength(1) prenom?: string;
  @IsOptional() @IsString() adresse?: string;
  @IsOptional() @IsEmail({}, { message: 'E-mail invalide' }) email?: string;
  @IsOptional() @IsString() @MinLength(3) telephone?: string;
  @IsOptional() @IsIn(STATUTS) statut?: Statut;
  @IsOptional() @IsUUID() projetId?: string | null;
}

class StatutDto {
  @IsIn(STATUTS) statut!: Statut;
}

class ListClientsQuery {
  // Le front envoie statut[]=a&statut[]=b ; qs le parse en tableau sous la clé `statut`.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsIn(STATUTS, { each: true })
  statut?: Statut[];
  @IsOptional() @IsString() semaine?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() ajoutePar?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

@Controller('clients')
class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListClientsQuery) {
    // Un agent ne voit que ses clients : le filtre « ajouté par » n'a de sens que pour le chef.
    return this.clients.list(u, u.role === 'agent' ? { ...q, ajoutePar: undefined } : q);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clients.get(u, id);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(u, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(u, id, dto);
  }
  @Patch(':id/statut') setStatut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutDto) {
    return this.clients.setStatut(u, id, dto.statut);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.clients.remove(u, id);
  }
}

@Module({ providers: [ClientsService], controllers: [ClientsController], exports: [ClientsService] })
export class ClientsModule {}
