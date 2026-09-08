/**
 * Company (OMC) Management Service.
 * Allows Super Super Admin to onboard new Oil Marketing Companies / HQ Tenants,
 * provision their HQ Admin credentials, and manage station branches.
 */

import { prodDb } from '../infra/db'
import { hashPin } from '../infra/password'
import { liveSyncBus } from './liveSyncBus'
import { auditLogRepo } from '../infra/repositories'
import type { Company, CompanyStation, Supervisor } from '../domain/types'

export interface CreateCompanyInput {
  name: string
  shortCode: string
  tagline?: string
  logoText?: string
  primaryColor: string
  accentColor?: string
  currency?: string
  adminName: string
  adminPin: string
  phone?: string
  initialStations?: {
    name: string
    code: string
    location: string
    region: string
    pumpsCount: number
  }[]
}

export class CompanyService {
  /** Lists all registered Oil Marketing Companies */
  async listAllCompanies(): Promise<Company[]> {
    const companies = await prodDb.companies.toArray()
    return companies.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Gets a single company by ID */
  async getCompanyById(id: string): Promise<Company | undefined> {
    return prodDb.companies.get(id)
  }

  /** Alias for getCompanyById */
  async getCompany(id: string): Promise<Company | undefined> {
    return this.getCompanyById(id)
  }

  /** Gets a company by short code (e.g. 'GOIL', 'TOTAL', 'PV') */
  async getCompanyByShortCode(shortCode: string): Promise<Company | undefined> {
    return prodDb.companies.where('shortCode').equalsIgnoreCase(shortCode.trim()).first()
  }

  /**
   * Onboard a new Oil Marketing Company (Super Super Admin only).
   * Provisions company HQ Admin credentials and initial station branches.
   */
  async createCompany(input: CreateCompanyInput): Promise<{
    company: Company
    adminCode: string
    adminPin: string
    stations: CompanyStation[]
  }> {
    const trimmedShortCode = input.shortCode.trim().toUpperCase()
    const existing = await this.getCompanyByShortCode(trimmedShortCode)
    if (existing) {
      throw new Error(`An Oil Marketing Company with short code "${trimmedShortCode}" is already registered.`)
    }

    const now = new Date().toISOString()
    const companyId = `COMP-${trimmedShortCode}-${crypto.randomUUID().slice(0, 6)}`
    const adminCode = `${trimmedShortCode}-HQ01`
    const { salt, hash } = await hashPin(input.adminPin)

    const company: Company = {
      id: companyId,
      name: input.name.trim(),
      shortCode: trimmedShortCode,
      tagline: input.tagline?.trim() || `${input.name.trim()} Downstream Petroleum Operations`,
      logoText: input.logoText?.trim() || trimmedShortCode,
      primaryColor: input.primaryColor || '#F97316',
      primaryDark: '#0B2545',
      accentColor: input.accentColor || '#F59E0B',
      currency: input.currency || 'GHS',
      adminCode,
      adminName: input.adminName.trim(),
      phone: input.phone?.trim() || '030 000 0000',
      active: true,
      createdAt: now,
    }

    await prodDb.companies.add(company)

    // Create Initial Station(s)
    const stations: CompanyStation[] = []
    const initialList = input.initialStations?.length
      ? input.initialStations
      : [
          {
            name: `${input.name.trim()} Main Flagship`,
            code: `${trimmedShortCode}-01`,
            location: 'Central Highway Station',
            region: 'Greater Accra',
            pumpsCount: 4,
          },
        ]

    for (let i = 0; i < initialList.length; i++) {
      const st = initialList[i]
      const stationObj: CompanyStation = {
        id: `STN-${trimmedShortCode}-${i + 1}`,
        companyId,
        name: st.name.trim(),
        code: st.code.trim().toUpperCase(),
        location: st.location.trim(),
        region: st.region.trim(),
        pumpsCount: st.pumpsCount || 4,
        createdAt: now,
      }
      stations.push(stationObj)
      await prodDb.companyStations.add(stationObj)
    }

    // Provision the Company HQ Admin account
    const primaryStationId = stations[0]?.id || `STN-${trimmedShortCode}-1`
    const hqAdminSupervisor: Supervisor = {
      id: `sup-${adminCode.toLowerCase()}`,
      employeeCode: adminCode,
      fullName: input.adminName.trim(),
      pinSalt: salt,
      pinHash: hash,
      stationId: primaryStationId,
      companyId,
      companyShortCode: trimmedShortCode,
      phone: input.phone?.trim() || '030 000 0000',
      isHeadOffice: true,
      approvalStatus: 'APPROVED',
      approvedAt: now,
      approvedBy: 'Super Super Admin',
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: now,
    }

    await prodDb.supervisors.add(hqAdminSupervisor)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'COMPANY_CREATED',
      actorId: 'super-admin',
      actorName: 'PetroView Platform Master Admin',
      actorRole: 'SUPERVISOR',
      targetId: companyId,
      targetDescription: `Onboarded Oil Company: ${company.name} (${trimmedShortCode}) with HQ Admin ${adminCode}`,
      notes: `Provisioned with ${stations.length} station branches`,
      timestamp: now,
    })

    liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'INSERT', key: hqAdminSupervisor.id })

    return {
      company,
      adminCode,
      adminPin: input.adminPin,
      stations,
    }
  }

  /** Lists all station branches for a given company */
  async listCompanyStations(companyId: string): Promise<CompanyStation[]> {
    return prodDb.companyStations.where('companyId').equals(companyId).toArray()
  }

  /** Adds a new station branch to a company */
  async addStationToCompany(
    companyId: string,
    station: { name: string; code: string; location: string; region: string; pumpsCount: number },
  ): Promise<CompanyStation> {
    const company = await this.getCompanyById(companyId)
    if (!company) throw new Error('Company not found.')

    const now = new Date().toISOString()
    const stObj: CompanyStation = {
      id: `STN-${company.shortCode}-${crypto.randomUUID().slice(0, 6)}`,
      companyId,
      name: station.name.trim(),
      code: station.code.trim().toUpperCase(),
      location: station.location.trim(),
      region: station.region.trim(),
      pumpsCount: station.pumpsCount || 4,
      createdAt: now,
    }

    await prodDb.companyStations.add(stObj)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STATION_CREATED',
      actorId: 'hq-admin',
      actorName: company.name,
      actorRole: 'SUPERVISOR',
      targetId: stObj.id,
      targetDescription: `New station ${stObj.name} (${stObj.code}) added to ${company.name}`,
      notes: stObj.location,
      timestamp: now,
    })

    return stObj
  }

  /** Updates an existing company's information */
  async updateCompany(
    companyId: string,
    updates: {
      name?: string
      shortCode?: string
      tagline?: string
      primaryColor?: string
      accentColor?: string
      phone?: string
      adminName?: string
      adminPin?: string
      active?: boolean
    },
  ): Promise<Company> {
    const company = await this.getCompanyById(companyId)
    if (!company) throw new Error('Company not found.')

    const updated: Company = {
      ...company,
      name: updates.name?.trim() ?? company.name,
      shortCode: updates.shortCode?.trim().toUpperCase() ?? company.shortCode,
      tagline: updates.tagline?.trim() ?? company.tagline,
      primaryColor: updates.primaryColor ?? company.primaryColor,
      accentColor: updates.accentColor ?? company.accentColor,
      phone: updates.phone?.trim() ?? company.phone,
      adminName: updates.adminName?.trim() ?? company.adminName,
      active: updates.active !== undefined ? updates.active : company.active,
    }

    await prodDb.companies.put(updated)

    // If admin PIN is being updated, update the supervisor account
    if (updates.adminPin && updates.adminPin.length === 4) {
      const { salt, hash } = await hashPin(updates.adminPin)
      const hqSupervisor = await prodDb.supervisors.where('employeeCode').equalsIgnoreCase(company.adminCode).first()
      if (hqSupervisor) {
        await prodDb.supervisors.update(hqSupervisor.id, {
          fullName: updated.adminName,
          pinSalt: salt,
          pinHash: hash,
        })
      }
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'COMPANY_UPDATED',
      actorId: 'super-admin',
      actorName: 'Super Super Admin',
      actorRole: 'SUPERVISOR',
      targetId: companyId,
      targetDescription: `Updated OMC profile: ${updated.name} (${updated.shortCode})`,
      notes: null,
      timestamp: new Date().toISOString(),
    })

    return updated
  }

  /** Deletes an OMC and its associated stations and staff */
  async deleteCompany(companyId: string): Promise<void> {
    const company = await this.getCompanyById(companyId)
    if (!company) throw new Error('Company not found.')

    await prodDb.companies.delete(companyId)
    await prodDb.companyStations.where('companyId').equals(companyId).delete()

    // Deactivate / remove supervisors and attendants associated with this company
    const supervisors = await prodDb.supervisors.where('companyId').equals(companyId).toArray()
    for (const sup of supervisors) {
      await prodDb.supervisors.delete(sup.id)
    }

    const attendants = await prodDb.attendants.where('companyId').equals(companyId).toArray()
    for (const att of attendants) {
      await prodDb.attendants.delete(att.id)
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'COMPANY_UPDATED',
      actorId: 'super-admin',
      actorName: 'Super Super Admin',
      actorRole: 'SUPERVISOR',
      targetId: companyId,
      targetDescription: `Deleted OMC tenant: ${company.name} (${company.shortCode})`,
      notes: 'Company and associated branches removed',
      timestamp: new Date().toISOString(),
    })
  }

  /** Updates a station branch */
  async updateStation(
    stationId: string,
    updates: { name?: string; code?: string; location?: string; region?: string; pumpsCount?: number },
  ): Promise<CompanyStation> {
    const station = await prodDb.companyStations.get(stationId)
    if (!station) throw new Error('Station not found.')

    const updated: CompanyStation = {
      ...station,
      name: updates.name?.trim() ?? station.name,
      code: updates.code?.trim().toUpperCase() ?? station.code,
      location: updates.location?.trim() ?? station.location,
      region: updates.region?.trim() ?? station.region,
      pumpsCount: updates.pumpsCount ?? station.pumpsCount,
    }

    await prodDb.companyStations.put(updated)
    return updated
  }

  /** Deletes a station branch */
  async deleteStation(stationId: string): Promise<void> {
    await prodDb.companyStations.delete(stationId)
  }
}

export const companyService = new CompanyService()
