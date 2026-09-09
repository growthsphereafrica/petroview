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
import {
  backendGetCompanies,
  backendCreateCompany,
  backendDeleteCompany,
  backendGetCompanyStations,
  backendCreateStation,
  backendDeleteStation,
} from '../../services/backendApiService'

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
    try {
      const cloud = await backendGetCompanies()
      if (cloud && Array.isArray(cloud.companies) && cloud.companies.length > 0) {
        const mapped: Company[] = cloud.companies.map(c => ({
          id: c.id,
          name: c.name,
          shortCode: c.shortCode,
          tagline: c.tagline || '',
          logoText: c.logoText || c.name.charAt(0),
          primaryColor: c.primaryColor || '#F97316',
          primaryDark: '#0B2545',
          accentColor: '#F59E0B',
          currency: 'GHS',
          adminCode: `${c.shortCode}-HQ01`,
          adminName: `${c.name} HQ Admin`,
          active: c.active !== false,
          createdAt: c.createdAt || new Date().toISOString(),
        }))
        for (const m of mapped) {
          await prodDb.companies.put(m)
        }
      }
    } catch {
      // fallback to local IndexedDB
    }
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
    const now = new Date().toISOString()
    const adminCode = `${trimmedShortCode}-HQ01`
    const { salt, hash } = await hashPin(input.adminPin)

    const initialStationsToPass = input.initialStations?.length
      ? input.initialStations.map((st, idx) => ({
          name: st.name.trim(),
          code: st.code.trim().toUpperCase() || `${trimmedShortCode}-${String(idx + 1).padStart(2, '0')}`,
          location: st.location.trim(),
          region: st.region.trim(),
          pumpsCount: st.pumpsCount || 4,
        }))
      : undefined

    let companyId = `comp-${trimmedShortCode.toLowerCase()}`

    // Call backend API to create company & auto-provision HQ admin on live server
    try {
      const backendRes = await backendCreateCompany({
        name: input.name.trim(),
        shortCode: trimmedShortCode,
        tagline: input.tagline,
        phone: input.phone,
        adminFullName: input.adminName.trim(),
        adminPin: input.adminPin,
        initialStations: initialStationsToPass,
      })
      if (backendRes.company?.id) {
        companyId = backendRes.company.id
      }
    } catch (backendErr: any) {
      console.warn('[companyService] Backend sync warning:', backendErr)
    }

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

    await prodDb.companies.put(company)

    // Create Initial Station(s)
    const stations: CompanyStation[] = []
    if (initialStationsToPass && initialStationsToPass.length > 0) {
      for (let i = 0; i < initialStationsToPass.length; i++) {
        const st = initialStationsToPass[i]
        const stationObj: CompanyStation = {
          id: `stn-${trimmedShortCode.toLowerCase()}-${st.code.toLowerCase()}`,
          companyId,
          name: st.name,
          code: st.code,
          location: st.location,
          region: st.region,
          pumpsCount: st.pumpsCount,
          createdAt: now,
        }
        stations.push(stationObj)
        await prodDb.companyStations.put(stationObj)
      }
    }

    // Provision the Company HQ Admin account
    const primaryStationId = stations[0]?.id || `stn-${trimmedShortCode.toLowerCase()}-01`
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

    await prodDb.supervisors.put(hqAdminSupervisor)

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
    try {
      const cloudStations = await backendGetCompanyStations(companyId)
      if (cloudStations && Array.isArray(cloudStations)) {
        for (const cs of cloudStations) {
          await prodDb.companyStations.put({
            id: cs.id,
            companyId: cs.companyId || companyId,
            name: cs.name,
            code: cs.code,
            location: cs.location,
            region: cs.region,
            pumpsCount: cs.pumpsCount,
            createdAt: new Date().toISOString(),
          })
        }
      }
    } catch {
      // fallback to local
    }
    return prodDb.companyStations.where('companyId').equals(companyId).toArray()
  }

  /** Adds a new station branch to a company */
  async addStationToCompany(
    companyId: string,
    station: { name: string; code: string; location: string; region: string; pumpsCount: number },
  ): Promise<CompanyStation> {
    const company = await this.getCompanyById(companyId)
    const shortCode = company?.shortCode || 'OMC'
    const now = new Date().toISOString()
    const stationCode = station.code.trim().toUpperCase()
    const stId = `stn-${shortCode.toLowerCase()}-${stationCode.toLowerCase()}`

    // Sync to backend API
    try {
      await backendCreateStation(companyId, {
        name: station.name.trim(),
        code: stationCode,
        location: station.location.trim(),
        region: station.region.trim(),
        pumpsCount: station.pumpsCount || 4,
      })
    } catch (err) {
      console.warn('[companyService] Backend create station warning:', err)
    }

    const stObj: CompanyStation = {
      id: stId,
      companyId,
      name: station.name.trim(),
      code: stationCode,
      location: station.location.trim(),
      region: station.region.trim(),
      pumpsCount: station.pumpsCount || 4,
      createdAt: now,
    }

    await prodDb.companyStations.put(stObj)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STATION_CREATED',
      actorId: 'hq-admin',
      actorName: company?.name || 'OMC HQ',
      actorRole: 'SUPERVISOR',
      targetId: stObj.id,
      targetDescription: `New station ${stObj.name} (${stObj.code}) added to ${company?.name || 'OMC'}`,
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

  /** Deletes an OMC and its associated stations and staff globally */
  async deleteCompany(companyId: string): Promise<void> {
    const company = await this.getCompanyById(companyId)
    const shortCode = company?.shortCode

    // 1. Delete on live backend server first
    try {
      await backendDeleteCompany(companyId)
    } catch (err) {
      console.warn('[companyService] Backend delete company warning:', err)
    }

    // 2. Cascade delete in local Dexie DB
    await prodDb.companies.delete(companyId)
    if (shortCode) {
      const byShortCode = await prodDb.companies.where('shortCode').equalsIgnoreCase(shortCode).toArray()
      for (const c of byShortCode) {
        await prodDb.companies.delete(c.id)
      }
    }
    await prodDb.companyStations.where('companyId').equals(companyId).delete()

    // Deactivate / remove supervisors associated with this company (strictly exclude Super Admin)
    const supervisors = await prodDb.supervisors.toArray()
    for (const sup of supervisors) {
      if (sup.isSuperAdmin || sup.employeeCode === 'SUPER-ADMIN') continue
      if (sup.companyId === companyId || (shortCode && (sup.companyShortCode === shortCode || sup.employeeCode.startsWith(shortCode)))) {
        await prodDb.supervisors.delete(sup.id)
      }
    }

    // Deactivate / remove attendants associated with this company
    const attendants = await prodDb.attendants.toArray()
    for (const att of attendants) {
      if (att.companyId === companyId || (shortCode && (att.companyShortCode === shortCode || att.employeeCode.startsWith(shortCode)))) {
        await prodDb.attendants.delete(att.id)
      }
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'COMPANY_UPDATED',
      actorId: 'super-admin',
      actorName: 'Super Super Admin',
      actorRole: 'SUPERVISOR',
      targetId: companyId,
      targetDescription: `Permanently deleted OMC tenant: ${company?.name || companyId} (${shortCode || ''})`,
      notes: 'Company and all associated branches and staff permanently removed',
      timestamp: new Date().toISOString(),
    })

    liveSyncBus.publish({ table: 'COMPANIES', reason: 'DELETE', key: companyId })
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
    const station = await prodDb.companyStations.get(stationId)
    if (station) {
      try {
        await backendDeleteStation(station.companyId, stationId)
      } catch (err) {
        console.warn('[companyService] Backend delete station warning:', err)
      }
    }
    await prodDb.companyStations.delete(stationId)
  }
}

export const companyService = new CompanyService()
