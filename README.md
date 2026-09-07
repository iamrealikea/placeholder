# Ticket Platform Web Application

## สมาขิกกลุ่ม
| ลำดับ | ชื่อ-สกุล              | รหัสนิสิต     |
| ----- | ------------------- |--------------|
| 1     | นางสาวชนิตา ชาญสำโรง | 68102010195  | 
| 2     | นายสิรวิชญ์ อัครสมบูรณ์  | 68102010217  |
| 3     | นายศุภกิตต์ แพรเมือง    | 68102010561  |

---
# ที่มาและความสำคัญ

ในสมัยนี้การจัดกิจกรรมไม่ว่าจะเป็นคอนเสิร์ต การแสดงสด หรืองานสัมมนา ได้รับความนิยมอย่างมาก ซึ่งเข้าถึงผู้คนทุกเพศทุกวัยและพฤติกรรมผู้บริโภคก็เปลี่ยนจากการซื้อตั๋วที่หน้างานมาเป็นการซื้อผ่านระบบออนไลน์ อย่างไรก็ตามก็มีหลากหลายผู้ให้บริการการซื้อจองตั๋วแต่อาจจะยังคงมีปัญหากับการจัดการกับปริมาณผู้ใช้ในช่วงที่ต้องมีการแย่งเพื่อจองตั๋ว รวมถึงปัญหาการนำตั๋วไปขายต่ออย่างปลอมแปลงและทุจริต

กลุ่มผู้จัดทำมองเห็นถึงแนวทางการจัดทำและพัฒนาระบบการจองตั๋วผ่านเว็ปแอปพลิเคชั่น (Ticket Platform Web Application) ซึ่งจะช่วยให้ทั้งในส่วนของผู้ใช้งานและผู้จัดงานสามารถเลือกใช้ระบบการจัดการให้รวบแบบเหมาะสมกับ (TODO)

---
# จุดประสงค์ของโปรเจกต์

# ประโยชน์ที่คาดว่าจะได้รับ 

---
# ขอบเขตของโปรเจกต์

---
# Functional and Non-Functional Functional
## Functional Requirements

| ID | Module | Requirement | Description |
|---|---|---|---|
| FR-01 | Authentication | Login | ผู้ใช้สามารถเข้าสู่ระบบด้วย Gmail, Facebook หรือเบอร์โทรศัพท์ |
| FR-02 | Authentication | Register | ผู้ใช้สามารถสมัครสมาชิกโดยกรอกชื่อ, Email, อายุ, เบอร์โทรศัพท์, Password, วันเกิด, เพศ, เลขบัตรประชาชน และที่อยู่ |
| FR-03 | Authentication | Logout | ผู้ใช้สามารถออกจากระบบได้ |
| FR-04 | Profile | View Profile | ผู้ใช้สามารถดูข้อมูล Profile ของตนเองได้ |
| FR-05 | Profile | Edit Profile | ผู้ใช้สามารถแก้ไขข้อมูลส่วนตัวและเปลี่ยนรูป Profile ได้ |
| FR-06 | Event | Event Categories | ระบบสามารถแบ่ง Event เป็นหมวดหมู่ เช่น Concert และ Seminar |
| FR-07 | Event | Event Status | ระบบแสดงสถานะของ Event เช่น Coming Soon, On Sale, Sold Out และ Closed |
| FR-08 | Event | Search Event | ผู้ใช้สามารถค้นหา Event จากชื่องาน, ชื่อศิลปิน หรือชื่อ Event |
| FR-09 | Event | Filter Event | ผู้ใช้สามารถกรอง Event ตามประเภท, วันที่, ศิลปิน และช่วงเวลาการเปิดขาย |
| FR-10 | Event | Popular Event | ระบบสามารถแสดง Event ที่ได้รับความนิยมเป็น Featured / Popular Event |
| FR-11 | Event | Bookmark | ผู้ใช้สามารถ Bookmark Event ที่สนใจได้ |
| FR-12 | Event | Event Details | ระบบแสดง Poster, ชื่องาน, ศิลปิน, รายละเอียด, วันที่, เวลา, เวลาเปิดประตู, สถานที่, ราคา และผังที่นั่ง |
| FR-13 | Event | Create Event | Admin สามารถเพิ่ม Event ใหม่ได้ |
| FR-14 | Event | Edit Event | Admin สามารถแก้ไขข้อมูล Event ได้ |
| FR-15 | Event | Delete Event | Admin สามารถลบ Event ได้ตามสิทธิ์ |
| FR-16 | Booking | Select Date / Round | ผู้ใช้สามารถเลือกวันที่, รอบ และเวลาของ Event ได้ |
| FR-17 | Booking | Seating Plan | ระบบต้องแสดงผังที่นั่งและหมายเลขที่นั่ง |
| FR-18 | Booking | Seat Status | ระบบแสดงสถานะที่นั่งเป็น Available, Selected และ Booked |
| FR-19 | Booking | Select Seat | ผู้ใช้สามารถเลือกและยกเลิกที่นั่งที่ต้องการได้ |
| FR-20 | Booking | Seat Availability | ระบบแสดงจำนวนที่นั่งว่างในแต่ละ Zone |
| FR-21 | Booking | Seat Zone | ระบบสามารถแบ่งที่นั่งเป็น Zone ต่าง ๆ ได้ |
| FR-22 | Booking | Seat Price | ระบบกำหนดและแสดงราคาตาม Zone ที่นั่ง |
| FR-23 | Booking | Prevent Double Booking | ระบบต้องป้องกันไม่ให้ผู้ใช้หลายคนจองที่นั่งเดียวกัน |
| FR-24 | Payment | Booking Summary | ระบบแสดงข้อมูลผู้ใช้, Event, Seat, ราคา, ค่าธรรมเนียม และยอดรวมก่อนชำระเงิน |
| FR-25 | Payment | Payment Methods | รองรับ QR Code / PromptPay, Credit Card, Debit Card, KBank, Krung Thai และ TrueMoney |
| FR-26 | Payment | Payment Confirmation | ระบบต้องแสดงยอดเงินและให้ผู้ใช้ยืนยันการชำระเงิน |
| FR-27 | Payment | Payment Success | เมื่อชำระเงินสำเร็จ ระบบบันทึก Booking และสร้าง Ticket |
| FR-28 | Ticket | My Tickets | ผู้ใช้สามารถดู Ticket ที่ซื้อไว้ได้ |
| FR-29 | Ticket | QR Ticket | Ticket ต้องมี QR Code สำหรับใช้ตรวจสอบการเข้างาน |
| FR-30 | Ticket | Ticket Validation | ระบบสามารถตรวจสอบ QR Code และเปลี่ยนสถานะเป็น Checked-in |
| FR-31 | Ticket | Prevent Reuse | Ticket ที่ Check-in แล้วไม่สามารถนำมาใช้ซ้ำได้ |
| FR-32 | History | Purchase History | ผู้ใช้สามารถดูประวัติการซื้อและสถานะ Booking ได้ |
| FR-33 | Notification | Payment Notification | ระบบแจ้งเตือนเมื่อชำระเงินสำเร็จ |
| FR-34 | Notification | Event Change | ระบบแจ้งเตือนเมื่อมีการเปลี่ยนแปลงวัน, เวลา, สถานที่ หรือรายละเอียด Event |
| FR-35 | Notification | Email Notification | ระบบสามารถส่ง Notification ผ่าน Email ได้ |
| FR-36 | Notification | Web Notification | ระบบแสดง Notification / Popup ภายในเว็บไซต์ |
| FR-37 | Notification | Bookmark Notification | ระบบแจ้งเตือนเมื่อ Event ที่ Bookmark เปิดขายหรือมีการเปลี่ยนแปลง |
| FR-38 | Cancellation | Cancel Ticket | ผู้ใช้สามารถยกเลิก Ticket ได้ตามเงื่อนไขของ Event |
| FR-39 | Cancellation | Refund | ระบบสามารถคำนวณและดำเนินการคืนเงินตามนโยบาย โดยไม่คืนค่าธรรมเนียม |
| FR-40 | Admin | Ticket Management | Admin สามารถกำหนดประเภทบัตร, จำนวนบัตร และราคาบัตร |
| FR-41 | Admin | Seating Management | Admin สามารถกำหนด Layout, Zone, สี, จำนวน และหมายเลขที่นั่ง |
| FR-42 | Admin | Booking Management | Admin สามารถตรวจสอบจำนวนบัตรที่จองและที่นั่งว่าง |
| FR-43 | Admin | Payment Management | Admin สามารถตรวจสอบสถานะการชำระเงิน |
| FR-44 | Admin | Sales Dashboard | ระบบแสดงกราฟยอดขายตั๋วรายเดือน |
| FR-45 | Support | Contact Admin | ผู้ใช้สามารถติดต่อ Admin เพื่อสอบถามหรือร้องเรียนได้ |
| FR-46 | Promotion | Point System | ผู้ใช้สามารถสะสมคะแนนจากการซื้อและใช้คะแนนตามเงื่อนไข |
| FR-47 | Promotion | Promotion | ระบบรองรับ Promotion และส่วนลด |
| FR-48 | Ticket Sale | Sale Period | Admin สามารถกำหนดวันเริ่มและสิ้นสุดการขายบัตร |
| FR-49 | Ticket Sale | Sale Restriction | ระบบไม่อนุญาตให้จองบัตรนอกช่วงเวลาที่กำหนด |

## Non-Functional Requirements

| ID | Category | Requirement | Description |
|---|---|---|---|
| NFR-01 | Performance | Fast Response | ระบบต้องตอบสนองต่อการใช้งานและโหลดหน้าเว็บได้อย่างรวดเร็ว |
| NFR-02 | Performance | Fast Loading | หน้า Event, Seat และ Payment ไม่ควรใช้เวลาโหลดนานจนกระทบการใช้งาน |
| NFR-03 | Availability | System Availability | ระบบต้องพร้อมให้บริการอย่างต่อเนื่อง โดยเฉพาะช่วงเปิดขายบัตร |
| NFR-04 | Security | User Security | ระบบต้องรักษาความปลอดภัยของบัญชีและข้อมูลส่วนบุคคลของผู้ใช้ |
| NFR-05 | Security | Payment Security | ระบบต้องรักษาความปลอดภัยของข้อมูลและกระบวนการชำระเงิน |
| NFR-06 | Security | Authentication | ระบบต้องมีการตรวจสอบตัวตนของผู้ใช้และ Admin |
| NFR-07 | Security | Authorization | ระบบต้องจำกัดสิทธิ์การเข้าถึงข้อมูลและฟังก์ชันของ Admin |
| NFR-08 | Data Integrity | Booking Integrity | ระบบต้องป้องกัน Double Booking และรักษาความถูกต้องของข้อมูลที่นั่ง |
| NFR-09 | Data Integrity | Transaction Integrity | ข้อมูล Booking, Payment และ Ticket ต้องสอดคล้องกัน |
| NFR-10 | Reliability | System Reliability | ระบบต้องสามารถทำงานได้อย่างถูกต้องและจัดการข้อผิดพลาดได้ |
| NFR-11 | Backup & Recovery | Data Backup | ระบบต้องสำรองข้อมูล User, Event, Seat, Booking, Payment และ Ticket |
| NFR-12 | Backup & Recovery | Data Recovery | ระบบต้องสามารถกู้คืนข้อมูล Ticket และ Booking เมื่อระบบเกิดความเสียหาย |
| NFR-13 | Scalability | Concurrent Users | ระบบควรรองรับผู้ใช้งานจำนวนมากพร้อมกัน โดยเฉพาะช่วงเปิดขาย |
| NFR-14 | Usability | Ease of Use | ระบบต้องใช้งานง่ายและมีขั้นตอนการจองที่ไม่ซับซ้อน |
| NFR-15 | Usability | Clear Information | ข้อมูลสำคัญ เช่น ราคา, ที่นั่ง และยอดชำระต้องแสดงอย่างชัดเจน |
| NFR-16 | Compatibility | Responsive | ระบบต้องรองรับ Desktop, Tablet และ Mobile |
| NFR-17 | Maintainability | Maintainable System | ระบบควรออกแบบให้สามารถแก้ไขและเพิ่ม Feature ได้ง่าย |

## Theme & UI/UX

| ID | Category | Requirement | Description |
|---|---|---|---|
| UI-01 | Theme | Oat Milk | ใช้สีหลัก Oat Milk `#FDF9F2` |
| UI-02 | Theme | Monday Blue | ใช้สีหลัก Monday Blue `#1D56CF` |
| UI-03 | Theme | Candy Apple | ใช้สี Accent Candy Apple `#FF0800` |
| UI-04 | Seat | Available Seat | ที่นั่งว่างแสดงเป็นวงกลมสีดำ ขอบสีขาว พร้อมหมายเลขที่นั่ง |
| UI-05 | Seat | Booked Seat | ที่นั่งที่ถูกจองแสดงด้วยเครื่องหมาย `✕` |
| UI-06 | Seat | Selected Seat | ที่นั่งที่ผู้ใช้เลือกแสดงด้วยเครื่องหมาย `✓` |
| UI-07 | Seat | Zone | แต่ละ Zone สามารถกำหนดสีและราคาแตกต่างกันได้ |
| UI-08 | Responsive | Mobile | รองรับการใช้งานบนโทรศัพท์มือถือ |
| UI-09 | Responsive | Desktop | รองรับการใช้งานบนคอมพิวเตอร์ |
| UI-10 | UX | Easy to Use | Interface ต้องเข้าใจง่ายและใช้งานสะดวก |
| UI-11 | UX | Booking Flow | ขั้นตอนการจองควรชัดเจน ตั้งแต่เลือก Event → เลือกที่นั่ง → Review → Payment → Ticket |
| UI-12 | UX | My Tickets | หน้า My Tickets ใช้ Theme สี Oat Milk |
| UI-13 | UX | Booking | หน้าจองที่นั่งใช้ Monday Blue เป็นสีหลัก |
---
# TOR
## spec
