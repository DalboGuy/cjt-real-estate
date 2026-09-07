const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const {presentBooking,presentImportedStay,summarizeBookings,summarizePeriod,isMtdCheckin,isCheckinInRange,expectedPayoutFromQuote,quoteParts,dateRangeForPreset,monthlyRevenueSeries,nightsBetween,guestNameFromNotes,loadImportedFinancials,monthKeyInTimeZone,monthLabelInTimeZone,PROPERTY_TIMEZONE}=require('./financials');

const now=new Date(Date.UTC(2026,8,7));

describe('quoteParts',()=>{
  it('marks missing quotes clearly',()=>{
    assert.equal(quoteParts(null).missing,true);
    assert.equal(quoteParts({}).missing,true);
  });
  it('reads stored seasonal quote fields',()=>{
    const parts=quoteParts({lodgingSubtotal:1000,cleaningFee:240,taxes:186,total:1426,nights:3});
    assert.equal(parts.missing,false);
    assert.equal(parts.lodging,1000);
    assert.equal(parts.cleaning,240);
    assert.equal(parts.taxes,186);
    assert.equal(parts.total,1426);
  });
});

describe('expectedPayoutFromQuote',()=>{
  it('uses lodging plus cleaning when those fields exist',()=>{
    assert.equal(expectedPayoutFromQuote({missing:false,lodging:1000,cleaning:240,total:1426}),1240);
  });
  it('falls back to total when line items are absent',()=>{
    assert.equal(expectedPayoutFromQuote({missing:false,lodging:null,cleaning:null,total:500}),500);
  });
  it('returns null when the quote is missing',()=>{
    assert.equal(expectedPayoutFromQuote({missing:true}),null);
  });
});

describe('presentBooking',()=>{
  it('treats unverified Stripe honestly and drops payout on closed stays',()=>{
    const quote={lodgingSubtotal:1000,cleaningFee:240,taxes:186,total:1426,nights:3};
    const payment={verified:false,checkoutCreated:true,amountDue:713};
    const active=presentBooking({
      id:'res_1',guest_name:'Ada',guest_email:'ada@example.com',guests:2,
      checkin:'2026-09-10',checkout:'2026-09-13',status:'confirmed',quote,payment
    });
    assert.equal(active.payment.status,'checkout_pending');
    assert.equal(active.expectedPayout,1240);
    const closed=presentBooking({
      id:'res_2',guest_name:'Ada',guest_email:'ada@example.com',guests:2,
      checkin:'2026-09-10',checkout:'2026-09-13',status:'cancelled',quote,payment
    });
    assert.equal(closed.closed,true);
    assert.equal(closed.expectedPayout,null);
  });
});

describe('summarizeBookings',()=>{
  it('aggregates MTD quoted money and Stripe counts from stored rows',()=>{
    const rows=[
      presentBooking({
        id:'in-month',guest_name:'Ada',checkin:'2026-09-10',checkout:'2026-09-13',status:'confirmed',
        quote:{lodgingSubtotal:1000,cleaningFee:240,taxes:186,total:1426},
        payment:{verified:true,verifiedAmount:713}
      }),
      presentBooking({
        id:'pending',guest_name:'Bo',checkin:'2026-09-20',checkout:'2026-09-22',status:'contract_sent',
        quote:{lodgingSubtotal:400,cleaningFee:240,taxes:96,total:736},
        payment:{verified:false,checkoutCreated:false}
      }),
      presentBooking({
        id:'no-quote',guest_name:'Cy',checkin:'2026-09-25',checkout:'2026-09-27',status:'inquiry_hold',
        quote:null,payment:{verified:false}
      }),
      presentBooking({
        id:'next-month',guest_name:'Di',checkin:'2026-10-01',checkout:'2026-10-04',status:'confirmed',
        quote:{lodgingSubtotal:800,cleaningFee:240,taxes:156,total:1196},
        payment:{verified:false}
      }),
      presentBooking({
        id:'cancelled-mtd',guest_name:'Ed',checkin:'2026-09-05',checkout:'2026-09-08',status:'cancelled',
        quote:{lodgingSubtotal:900,cleaningFee:240,taxes:171,total:1311},
        payment:{verified:false}
      })
    ];
    const summary=summarizeBookings(rows,now);
    assert.equal(summary.mtd.lodging,1400);
    assert.equal(summary.mtd.cleaning,480);
    assert.equal(summary.mtd.taxes,282);
    assert.equal(summary.mtd.total,2162);
    assert.equal(summary.mtd.expectedPayout,1880);
    assert.equal(summary.mtd.quotedBookings,2);
    assert.equal(summary.counts.quotedBookings,4);
    assert.equal(summary.counts.missingQuote,1);
    assert.equal(summary.counts.stripeVerified,1);
    assert.equal(summary.counts.stripePending,4);
    assert.equal(summary.records,4);
    assert.equal(summary.mtdMonth,'2026-09');
    assert.equal(summary.mtdMonthLabel,'Sep 2026');
    assert.equal(summary.timezone,PROPERTY_TIMEZONE);
    assert.equal(isMtdCheckin('2026-09-10',now),true);
    assert.equal(isMtdCheckin('2026-10-01',now),false);
  });

  it('keeps empty datasets at null money instead of invented zeros',()=>{
    const summary=summarizeBookings([],now);
    assert.equal(summary.mtd.total,null);
    assert.equal(summary.mtd.expectedPayout,null);
    assert.equal(summary.counts.bookings,0);
    assert.equal(summary.records,0);
    assert.equal(summary.mtdMonth,'2026-09');
    assert.equal(summary.mtdMonthLabel,'Sep 2026');
  });
});

describe('America/Chicago month boundary',()=>{
  it('uses property timezone, not UTC, for the MTD month',()=>{
    const stillAugust=new Date('2026-09-01T04:30:00.000Z');
    const septemberInChicago=new Date('2026-09-01T06:30:00.000Z');
    assert.equal(monthKeyInTimeZone(stillAugust),'2026-08');
    assert.equal(monthLabelInTimeZone(stillAugust),'Aug 2026');
    assert.equal(isMtdCheckin('2026-08-31',stillAugust),true);
    assert.equal(isMtdCheckin('2026-09-01',stillAugust),false);
    assert.equal(monthKeyInTimeZone(septemberInChicago),'2026-09');
    assert.equal(monthLabelInTimeZone(septemberInChicago),'Sep 2026');
    assert.equal(isMtdCheckin('2026-09-01',septemberInChicago),true);
    assert.equal(isMtdCheckin('2026-08-31',septemberInChicago),false);
  });

  it('excludes a September check-in from MTD while Chicago is still August',()=>{
    const stillAugust=new Date('2026-09-01T04:30:00.000Z');
    const rows=[
      presentBooking({
        id:'aug-stay',guest_name:'Ada',checkin:'2026-08-20',checkout:'2026-08-23',status:'confirmed',
        quote:{lodgingSubtotal:500,cleaningFee:240,taxes:111,total:851},
        payment:{verified:false}
      }),
      presentBooking({
        id:'sep-stay',guest_name:'Bo',checkin:'2026-09-01',checkout:'2026-09-04',status:'confirmed',
        quote:{lodgingSubtotal:800,cleaningFee:240,taxes:156,total:1196},
        payment:{verified:false}
      })
    ];
    const summary=summarizeBookings(rows,stillAugust);
    assert.equal(summary.mtdMonth,'2026-08');
    assert.equal(summary.mtdMonthLabel,'Aug 2026');
    assert.equal(summary.mtd.quotedBookings,1);
    assert.equal(summary.mtd.lodging,500);
    assert.equal(summary.mtd.total,851);
  });
});

describe('nightsBetween and guest notes',()=>{
  it('counts nights from stay dates and reads imported guest names',()=>{
    assert.equal(nightsBetween('2026-08-21','2026-08-23'),2);
    assert.equal(nightsBetween('2026-08-21','2026-08-21'),null);
    assert.equal(guestNameFromNotes('Guest: Trey Payne'),'Trey Payne');
    assert.equal(guestNameFromNotes('Guest: Maria Solis | Low-dollar adjustment / review'),'Maria Solis');
  });
});

describe('presentImportedStay',()=>{
  it('maps stored OTA money and source without inventing lodging',()=>{
    const row=presentImportedStay({
      booking_key:'airbnb:HM5T9FY5BX',channel:'airbnb',checkin:'2026-08-07',checkout:'2026-08-09',
      status:'confirmed',gross_revenue:1327.89,taxes:null,cleaning_fee:240,expected_payout:1287.99,
      source:'str_financial_workbook_2026',external_reference:'HM5T9FY5BX',notes:'Guest: Ruben Diaz'
    });
    assert.equal(row.kind,'ota');
    assert.equal(row.sourceLabel,'Airbnb');
    assert.equal(row.guestName,'Ruben Diaz');
    assert.equal(row.nights,2);
    assert.equal(row.quote.missing,false);
    assert.equal(row.quote.lodging,null);
    assert.equal(row.quote.total,1327.89);
    assert.equal(row.expectedPayout,1287.99);
    assert.equal(row.payment.status,'ota');
  });

  it('treats cancelled OTA payout as closed and keeps stored zeros honest',()=>{
    const row=presentImportedStay({
      booking_key:'booking.com:5277474993',channel:'booking.com',checkin:'2026-07-31',checkout:'2026-08-02',
      status:'cancelled',gross_revenue:1260,taxes:null,cleaning_fee:0,expected_payout:0,
      source:'str_financial_workbook_2026',notes:'Guest: Tatyana Ursin'
    });
    assert.equal(row.closed,true);
    assert.equal(row.expectedPayout,null);
    assert.equal(row.quote.cleaning,0);
    assert.equal(row.quote.total,1260);
  });
});

describe('dateRangeForPreset',()=>{
  it('uses America/Chicago for this month and this year',()=>{
    const stillAugust=new Date('2026-09-01T04:30:00.000Z');
    const september=new Date('2026-09-01T06:30:00.000Z');
    assert.deepEqual(dateRangeForPreset('month',stillAugust),{preset:'month',from:'2026-08-01',to:'2026-08-31'});
    assert.deepEqual(dateRangeForPreset('year',stillAugust),{preset:'year',from:'2026-01-01',to:'2026-12-31'});
    assert.deepEqual(dateRangeForPreset('month',september),{preset:'month',from:'2026-09-01',to:'2026-09-30'});
    assert.equal(isCheckinInRange('2026-08-21',dateRangeForPreset('month',stillAugust)),true);
    assert.equal(isCheckinInRange('2026-09-01',dateRangeForPreset('month',stillAugust)),false);
    assert.equal(isCheckinInRange('2026-08-21',dateRangeForPreset('custom',september,{from:'2026-08-01',to:'2026-08-31'})),true);
  });
});

describe('summarizePeriod and monthly chart',()=>{
  const rows=[
    presentBooking({
      id:'direct-aug',guest_name:'Ada',checkin:'2026-08-10',checkout:'2026-08-13',status:'confirmed',
      quote:{lodgingSubtotal:900,cleaningFee:240,taxes:171,total:1311,nights:3},
      payment:{verified:true,verifiedAmount:655}
    }),
    presentImportedStay({
      booking_key:'airbnb:HM5T9FY5BX',channel:'airbnb',checkin:'2026-08-07',checkout:'2026-08-09',
      status:'confirmed',gross_revenue:1327.89,taxes:null,cleaning_fee:240,expected_payout:1287.99,
      notes:'Guest: Ruben Diaz'
    }),
    presentImportedStay({
      booking_key:'vrbo:HA-QRCJ2C',channel:'vrbo',checkin:'2026-08-21',checkout:'2026-08-23',
      status:'confirmed',gross_revenue:1081.30,taxes:null,cleaning_fee:0,expected_payout:989.94,
      notes:'Guest: Trey Payne'
    }),
    presentImportedStay({
      booking_key:'booking.com:5277474993',channel:'booking.com',checkin:'2026-07-31',checkout:'2026-08-02',
      status:'cancelled',gross_revenue:1260,expected_payout:0,notes:'Guest: Tatyana Ursin'
    }),
    presentBooking({
      id:'direct-sep',guest_name:'Bo',checkin:'2026-09-10',checkout:'2026-09-13',status:'confirmed',
      quote:{lodgingSubtotal:1000,cleaningFee:240,taxes:186,total:1426,nights:3},
      payment:{verified:false}
    })
  ];

  it('builds This year KPIs from Direct + OTA and skips cancelled revenue',()=>{
    const summary=summarizePeriod(rows,dateRangeForPreset('year',now),now);
    assert.equal(summary.period.quotedBookings,4);
    assert.equal(summary.period.total,1311+1327.89+1081.30+1426);
    assert.equal(summary.period.nights,10);
    assert.equal(summary.period.directRevenue,1311+1426);
    assert.equal(summary.period.otaRevenue,1327.89+1081.30);
    assert.equal(summary.counts.stripeVerified,1);
    assert.equal(summary.counts.stripePending,1);
    assert.equal(summary.counts.ota,3);
    assert.equal(summary.mtd.total,1426);
  });

  it('does not count OTA rows as Stripe pending',()=>{
    const summary=summarizeBookings(rows,now);
    assert.equal(summary.counts.direct,2);
    assert.equal(summary.stripe_pending,1);
    assert.equal(summary.stripe_verified,1);
  });

  it('keeps empty months at null instead of invented zeros',()=>{
    const chart=monthlyRevenueSeries(rows,{from:'2026-07-01',to:'2026-09-30'});
    const july=chart.find(m=>m.month==='2026-07');
    const august=chart.find(m=>m.month==='2026-08');
    const september=chart.find(m=>m.month==='2026-09');
    assert.equal(july.total,null);
    assert.equal(july.ota,null);
    assert.equal(august.direct,1311);
    assert.equal(august.ota,1327.89+1081.30);
    assert.equal(september.direct,1426);
    assert.equal(september.ota,null);
  });
});

describe('loadImportedFinancials',()=>{
  it('returns unavailable when booking_financials is missing',async()=>{
    const sql=async()=>[{relation:null}];
    const result=await loadImportedFinancials(sql);
    assert.equal(result.available,false);
    assert.deepEqual(result.rows,[]);
  });
});
