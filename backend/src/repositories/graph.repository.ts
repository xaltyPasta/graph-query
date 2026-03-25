import { prisma } from "../config/prisma";
import { Customer, Order, OrderItem, Delivery, Invoice, Payment, Product, Address } from "@prisma/client";

export interface IGraphRepository {
  getCustomersByIds(ids: string[]): Promise<any[]>;
  getOrdersByIds(ids: string[]): Promise<any[]>;
  getOrderItemsByIds(ids: string[]): Promise<any[]>;
  getDeliveriesByIds(ids: string[]): Promise<any[]>;
  getInvoicesByIds(ids: string[]): Promise<any[]>;
  getPaymentsByIds(ids: string[]): Promise<any[]>;
  getProductsByIds(ids: string[]): Promise<any[]>;
  getLocationsByIds(ids: string[]): Promise<any[]>;
}

export class GraphRepository implements IGraphRepository {
  public async getCustomersByIds(ids: string[]) {
    return prisma.customer.findMany({
      where: { id: { in: ids } },
      include: { orders: { select: { id: true } }, address: { select: { id: true } } },
    });
  }

  public async getOrdersByIds(ids: string[]) {
    return prisma.order.findMany({
      where: { id: { in: ids } },
      include: { orderItems: { select: { id: true } }, deliveries: { select: { id: true } }, customer: { select: { id: true } } },
    });
  }

  public async getOrderItemsByIds(ids: string[]) {
    return prisma.orderItem.findMany({
      where: { id: { in: ids } },
      include: { product: { select: { id: true } }, order: { select: { id: true } } },
    });
  }

  public async getDeliveriesByIds(ids: string[]) {
    return prisma.delivery.findMany({
      where: { id: { in: ids } },
      include: { invoice: { select: { id: true } }, order: { select: { id: true } }, address: { select: { id: true } } },
    });
  }

  public async getInvoicesByIds(ids: string[]) {
    return prisma.invoice.findMany({
      where: { id: { in: ids } },
      include: { payment: { select: { id: true } }, delivery: { select: { id: true } } },
    });
  }

  public async getPaymentsByIds(ids: string[]) {
    return prisma.payment.findMany({
      where: { id: { in: ids } },
      include: { invoice: { select: { id: true } } },
    });
  }

  public async getProductsByIds(ids: string[]) {
    return prisma.product.findMany({
      where: { id: { in: ids } },
      include: { orderItems: { select: { id: true, orderId: true } } },
    });
  }

  public async getLocationsByIds(ids: string[]) {
    return prisma.address.findMany({
      where: { id: { in: ids } },
      include: { customers: { select: { id: true } }, deliveries: { select: { id: true } } },
    });
  }
}
