import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import "../theme-shadcn.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { BarChart3, TrendingUp, Users, DollarSign, ShoppingCart, Eye } from 'lucide-react';

const stats = [
  { label: 'Total Revenue', value: '$128,430', change: '+12.5%', icon: DollarSign, color: 'text-emerald-500' },
  { label: 'Active Users', value: '2,847', change: '+8.2%', icon: Users, color: 'text-blue-500' },
  { label: 'Orders', value: '1,423', change: '+23.1%', icon: ShoppingCart, color: 'text-violet-500' },
  { label: 'Growth', value: '18.7%', change: '+4.3%', icon: TrendingUp, color: 'text-amber-500' },
];

const recentOrders = [
  { id: '#ORD-001', customer: 'Alice Johnson', product: 'ERP License', amount: '$2,400', status: 'completed' as const },
  { id: '#ORD-002', customer: 'Bob Smith', product: 'Consulting', amount: '$1,200', status: 'processing' as const },
  { id: '#ORD-003', customer: 'Carol White', product: 'Support Plan', amount: '$800', status: 'pending' as const },
  { id: '#ORD-004', customer: 'David Brown', product: 'ERP License', amount: '$2,400', status: 'completed' as const },
  { id: '#ORD-005', customer: 'Eve Davis', product: 'Training', amount: '$600', status: 'processing' as const },
];

const statusVariant = { completed: 'default' as const, processing: 'secondary' as const, pending: 'outline' as const };

export default function UIDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight gradient-text">shadcn/ui Proof of Concept</h1>
        <p className="text-muted-foreground mt-1">Premium components with glassmorphism & gradient accents</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="stat-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-emerald-500 font-medium">{s.change}</span> vs last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Table */}
      <Tabs defaultValue="orders" className="w-full">
        <TabsList>
          <TabsTrigger value="orders">Recent Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
              <CardDescription>Latest 5 orders from the system</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.id}</TableCell>
                      <TableCell>{o.customer}</TableCell>
                      <TableCell>{o.product}</TableCell>
                      <TableCell>{o.amount}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[o.status]}>
                          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Overview</CardTitle>
              <CardDescription>Performance metrics at a glance</CardDescription>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Chart component placeholder</p>
                <p className="text-sm">(Recharts integration coming soon)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="components" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Component Showcase</CardTitle>
              <CardDescription>shadcn/ui components in action</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Buttons */}
              <div>
                <h4 className="text-sm font-medium mb-3">Button Variants</h4>
                <div className="flex flex-wrap gap-2">
                  <Button>Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>

              {/* Badges */}
              <div>
                <h4 className="text-sm font-medium mb-3">Badge Variants</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                </div>
              </div>

              {/* Dialog */}
              <div>
                <h4 className="text-sm font-medium mb-3">Dialog</h4>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Premium Dialog</DialogTitle>
                      <DialogDescription>
                        This dialog uses shadcn/ui with glassmorphism styling.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-sm text-muted-foreground">
                      <p>This is a proof of concept showing that shadcn/ui components work correctly alongside the existing ERP Core dashboard.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Glass Card */}
              <div>
                <h4 className="text-sm font-medium mb-3">Glassmorphism Card</h4>
                <div className="glass-card rounded-xl p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Glass Card</p>
                      <p className="text-sm text-muted-foreground">Backdrop blur with premium feel</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
