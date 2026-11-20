# Ticket Platform Web Application (TicketHub)

## สมาชิกกลุ่ม (Team Members)

| ลำดับ | ชื่อ-สกุล | รหัสนิสิต | บทบาทหน้าที่รับผิดชอบ (Role) |
| :---: | :--- | :---: | :--- |
| 1 | นางสาวชนิตา ชาญสำโรง | 68102010195 |  QA & Frontend Developer |
| 2 | นายสิรวิชญ์ อัครสมบูรณ์ | 68102010217 | Backend Architect & DevOps Engineer |
| 3 | นายศุภกิตต์ แพรเมือง | 68102010561 | UX/UI Designer, Security & Data Engineer |

---

## สารบัญรายงานแต่ละเฟส (Project Phase Reports)

| เฟส (Phase) | หัวข้อหลัก | เอกสารอ้างอิง |
| :---: | :--- | :--- |
| **Phase 1** | Requirement, TOR, User Stories & Sprint 1 Planning | เอกสารหลักในหน้านี้ (`README.md`) และ [`TOR.md`](./TOR.md) |
| **Phase 2** | Initial Design, Figma Prototype & System Diagrams | [`docs/phase-2-report.md`](./docs/phase-2-report.md) |
| **Phase 3** | MVC Implementation, Unit Tests, Coverage & Profiling Baseline | [`docs/phase-3-report.md`](./docs/phase-3-report.md) |
| **Phase 4** | Final Product, 5 UI Test Cases, Profiling Comparison & CI/CD | [`docs/phase-4-report.md`](./docs/phase-4-report.md) |

---

# Phase 1: Requirement and User Story

## 1. ที่มาและความสำคัญ

ในสมัยนี้การจัดกิจกรรมไม่ว่าจะเป็นคอนเสิร์ต การแสดงสด หรืองานสัมมนา ได้รับความนิยมอย่างมาก ซึ่งเข้าถึงผู้คนทุกเพศทุกวัยและพฤติกรรมผู้บริโภคก็เปลี่ยนจากการซื้อตั๋วที่หน้างานมาเป็นการซื้อผ่านระบบออนไลน์ อย่างไรก็ตามก็มีหลากหลายผู้ให้บริการการซื้อจองตั๋วแต่อาจจะยังคงมีปัญหากับการจัดการกับปริมาณผู้ใช้ในช่วงที่ต้องมีการแย่งเพื่อจองตั๋ว รวมถึงปัญหาการนำตั๋วไปขายต่ออย่างปลอมแปลงและทุจริต

กลุ่มผู้จัดทำมองเห็นถึงแนวทางการจัดทำและพัฒนาระบบการจองตั๋วผ่านเว็บแอปพลิเคชัน (**Ticket Platform Web Application — TicketHub**) ซึ่งจะช่วยเป็นศูนย์กลางในการให้ผู้ใช้ค้นหาและติดตามกิจกรรม ดูรายละเอียดงาน เลือกโซนและที่นั่งจากผังที่นั่ง ชำระเงิน และรับบัตรอิเล็กทรอนิกส์ที่มี QR Code สำหรับใช้เข้างานได้ ระบบยังช่วยให้ผู้จัดงานหรือผู้ดูแลระบบสามารถจัดการข้อมูลกิจกรรม ผังที่นั่ง ประเภทและราคาบัตร ช่วงเวลาการขาย รายการจอง และข้อมูลการชำระเงินได้อย่างเป็นระบบ

โดยจะช่วยลดความซับซ้อนของกระบวนการซื้อบัตร เพิ่มความถูกต้องของข้อมูล และป้องกันการจองที่นั่งซ้ำ โดยกำหนดสิทธิ์ของที่นั่งตามผู้ที่ชำระเงินสำเร็จก่อน พร้อมทั้งมีการล็อกที่นั่งชั่วคราวระหว่างรอชำระเงิน นอกจากนี้ ระบบยังส่งเสริมประสบการณ์ของผู้ใช้ด้วยการแจ้งเตือนการชำระเงิน การเปลี่ยนแปลงกิจกรรม และการเปิดขายบัตรของกิจกรรมที่บันทึกไว้ รวมถึงรองรับการใช้งานผ่านอุปกรณ์หลายขนาด จึงช่วยให้ทั้งผู้ซื้อบัตรและผู้จัดงานสามารถดำเนินการได้อย่างมีประสิทธิภาพ ปลอดภัย และน่าเชื่อถือมากขึ้น

---

## 2. จุดประสงค์ของโปรเจกต์

1. เพื่อพัฒนาระบบการจองตั๋วผ่านเว็บแอปพลิเคชันที่มีประสิทธิภาพสูง รองรับการเข้าใช้งานของผู้ใช้ในหลายแพลตฟอร์มพร้อมกันได้อย่างมีประสิทธิภาพในช่วงเวลาที่มีการเปิดจอง
2. เพื่อเพิ่มความปลอดภัยและลดปัญหาการทุจริต เช่น การปลอมแปลงตั๋วและการนำตั๋วไปขายต่อเกินราคา ด้วยระบบตรวจสอบและยืนยันสิทธิ์ที่มีความน่าเชื่อถือ
3. เพื่ออำนวยความสะดวกให้แก่ผู้จัดงานในการบริหารจัดการกิจกรรม ตั๋วเข้างาน และการวิเคราะห์ข้อมูลผู้เข้าร่วมงานได้อย่างเป็นระบบและเหมาะสมกับรูปแบบงาน

---

## 3. ประโยชน์ที่คาดว่าจะได้รับ

1. **สำหรับผู้ใช้งาน:** ได้รับความสะดวกในการจองตั๋วผ่านระบบออนไลน์ที่เสถียร ไม่หลุดหรือค้างระหว่างทำรายการ และมั่นใจได้ว่าจะได้รับตั๋วแท้ที่ปลอดภัยจากการทุจริต
2. **สำหรับผู้จัดงาน:** มีระบบการจัดการตั๋วที่ยืดหยุ่น ปรับแต่งให้เหมาะสมกับรูปแบบงานได้ง่าย พร้อมระบบสรุปข้อมูลการขายแบบ Real-time ช่วยลดภาระงานและเพิ่มความเรียบร้อยในการตรวจตั๋วหน้างาน
3. **สำหรับภาพรวมระบบ:** ช่วยสร้างมาตรฐานใหม่ให้กับระบบ Ticketing Platform ที่ลดปัญหาบัตรผี และรองรับภาระการจราจรของข้อมูลมหาศาลได้อย่างมีประสิทธิภาพ

---

## 4. ขอบเขตของโปรเจกต์ (Project Scope)

### 4.1 สิ่งที่อยู่ในขอบเขต (In Scope)
ในโครงการนี้จะครอบคลุมถึงการพัฒนาระบบจองบัตรคอนเสิร์ตและกิจกรรมผ่านช่องทางออนไลน์สำหรับผู้ใช้งานทั่วไป เจ้าหน้าที่หน้างาน และผู้ดูแลระบบ โดยมีขอบเขตดังนี้:

1. **ระบบผู้ใช้งาน:** ผู้ใช้สามารถลงทะเบียนสมัครสมาชิก เข้าสู่ระบบด้วย Email/Password, Gmail, Facebook หรือหมายเลขโทรศัพท์ ออกจากระบบ และแก้ไขข้อมูลส่วนบุคคลพร้อมรูปโปรไฟล์
2. **การค้นหากิจกรรม:** ผู้ใช้สามารถดูรายการกิจกรรมตามหมวดหมู่ ค้นหาจากชื่องานหรือศิลปิน กรองตามประเภท วันที่ ศิลปิน และช่วงเวลาขายบัตร รวมถึงดูกิจกรรมยอดนิยมและบันทึกกิจกรรมที่สนใจ
3. **รายละเอียดกิจกรรม:** แสดงข้อมูลสำคัญของกิจกรรม โปสเตอร์ ชื่องาน ศิลปิน รายละเอียด วันและเวลา สถานที่ ราคา สถานะการขาย และผังที่นั่ง ผู้ใช้สามารถเลือกวันที่ รอบการแสดง และโซนที่ต้องการได้
4. **การจองบัตรและเลือกที่นั่ง:** ระบบแสดงผังและหมายเลขที่นั่ง พร้อมสถานะว่าง จองแล้ว และกำลังเลือก ผู้ใช้สามารถเลือกหรือยกเลิกที่นั่งก่อนชำระเงินได้ ระบบแบ่งโซนที่นั่ง กำหนดราคาในแต่ละโซน แสดงจำนวนที่นั่งคงเหลือ และป้องกันการจองที่นั่งซ้ำ
5. **การชำระเงินและการออกบัตร:** ระบบแสดงสรุปรายการจองและยอดชำระเงินก่อนยืนยัน รองรับการชำระเงินผ่าน QR Code หรือ PromptPay บัตรเครดิต บัตรเดบิต KBank Krung Thai และ TrueMoney เมื่อชำระเงินสำเร็จ ระบบจะบันทึกรายการจอง ออกบัตรพร้อม QR Code และเปลี่ยนสถานะที่นั่งเป็นจองแล้ว
6. **บัตรและประวัติการใช้งาน:** ผู้ใช้สามารถดูบัตรอิเล็กทรอนิกส์ ประวัติการซื้อ และสถานะการจองได้ โดย QR Code ใช้สำหรับตรวจสอบสิทธิ์เข้างาน และเมื่อมีการเช็กอินแล้ว ระบบต้องป้องกันการนำบัตรเดิมมาใช้ซ้ำ
7. **การแจ้งเตือน การยกเลิก และการคืนเงิน:** ระบบแจ้งเตือนผลการชำระเงิน การเปลี่ยนแปลงรายละเอียดกิจกรรม และสถานะกิจกรรมที่ผู้ใช้บันทึกไว้ ผ่านการแจ้งเตือนภายในเว็บไซต์และอีเมล ผู้ใช้สามารถยกเลิกบัตรตามเงื่อนไขของกิจกรรม และระบบคำนวณยอดคืนเงินตามนโยบายโดยไม่คืนค่าธรรมเนียมบริการ
8. **ระบบผู้ดูแล:** ผู้ดูแลระบบสามารถตรวจสอบสิทธิ์ จัดการกิจกรรม ผังที่นั่ง โซน ราคา จำนวนบัตร ช่วงเวลาการขาย รายการจอง และข้อมูลการชำระเงินได้ รวมถึงดูรายงานหรือกราฟยอดขายบัตรรายเดือน
9. **ด้านคุณภาพระบบ:** ระบบรองรับการใช้งานบนคอมพิวเตอร์ แท็บเล็ต และโทรศัพท์มือถือ ออกแบบให้ใช้งานง่าย ตอบสนองรวดเร็ว รักษาความปลอดภัยของบัญชีและข้อมูลส่วนบุคคลด้วยการยืนยันตัวตน การกำหนดสิทธิ์ การเข้ารหัสรหัสผ่าน และมีระบบสำรองและกู้คืนข้อมูลสำคัญ

### 4.2 สิ่งที่ไม่อยู่ในขอบเขต (Out of Scope)
* **การตัดเงินจริงผ่านธนาคารหรือ Payment Gateway ระดับ Production:** ในขอบเขตโครงการนี้เป็นการจำลองกระบวนการชำระเงิน (Payment Simulation & Validation) ไม่มีการหักเงินจริงจากบัญชีธนาคาร
* **การส่ง SMS OTP จริงผ่านเครือข่ายโทรศัพท์:** ระบบเข้าสู่ระบบด้วยเบอร์โทรศัพท์เป็นการจำลองเพื่อสาธิตการทำงาน (Demo Mode)
* **การจัดส่งบัตรกระดาษทางไปรษณีย์ (Physical Ticket Delivery):** ระบบออกเฉพาะบัตรอิเล็กทรอนิกส์ (E-Ticket พร้อม QR Code) เท่านั้น
* **ระบบตลาดซื้อขายบัตรมือสอง (Secondary Ticket Resale Marketplace):** ไม่อนุญาตให้โอนหรือตั้งขายบัตรต่อผ่านแพลตฟอร์ม เพื่อป้องกันปัญหาบัตรผี

---

## 5. Functional and Non-Functional Requirements

### 5.1 Functional Requirements (`FR-01` – `FR-49`)
*(หมายเหตุ: `FR-50` ถูกเพิ่มเติมใน Phase 2 จากการทบทวนความต้องการเพื่อป้องกันการปลอมแปลงบัตร — ดูรายละเอียดใน [`docs/phase-2-report.md`](./docs/phase-2-report.md))*

| ID | Module | Requirement | Description |
| :--- | :--- | :--- | :--- |
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

### 5.2 Non-Functional Requirements (`NFR-01` – `NFR-17`)

| ID | Category | Requirement | Description |
| :--- | :--- | :--- | :--- |
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

### 5.3 Theme & UI/UX Requirements (`UI-01` – `UI-13`)

| ID | Category | Requirement | Description |
| :--- | :--- | :--- | :--- |
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
| UI-11 | UX | Booking Flow | ขั้นตอนการจองควรชัดเจน ตั้งแต่เลือก Event -> เลือกที่นั่ง -> Review -> Payment -> Ticket |
| UI-12 | UX | My Tickets | หน้า My Tickets ใช้ Theme สี Oat Milk |
| UI-13 | UX | Booking | หน้าจองที่นั่งใช้ Monday Blue เป็นสีหลัก |

---

## 6. Terms of Reference (TOR)

ทีมได้จัดทำเอกสารข้อกำหนดโครงการ (**Terms of Reference — TOR**) ฉบับเต็มตาม Functional & Non-Functional Requirements ข้างต้นไว้ที่ไฟล์ **[`TOR.md`](./TOR.md)** โดยแบ่งขอบเขตการส่งมอบออกเป็น 10 โมดูลหลัก ได้แก่:
1. ระบบสมาชิกและการยืนยันตัวตน (`FR-01`–`FR-05`)
2. ระบบจัดการและค้นหาอีเวนต์ (`FR-06`–`FR-12`)
3. ระบบการจองบัตรและผังที่นั่งพร้อมป้องกันการจองซ้ำ (`FR-16`–`FR-23`, `FR-50`)
4. ระบบการชำระเงิน 6 ช่องทาง (`FR-24`–`FR-27`)
5. ระบบตั๋ว QR Code และการตรวจสอบเข้างานแบบใช้ครั้งเดียว (`FR-28`–`FR-32`)
6. ระบบยกเลิกและคืนเงินตามนโยบายไม่คืนค่าธรรมเนียม (`FR-38`–`FR-39`)
7. ระบบโปรโมชันและคะแนนสะสม (`FR-46`–`FR-47`)
8. ระบบแจ้งเตือนผ่านเว็บและอีเมล (`FR-33`–`FR-37`)
9. ระบบบริหารจัดการหลังบ้านสำหรับผู้ดูแลระบบและกราฟยอดขาย (`FR-13`–`FR-15`, `FR-40`–`FR-44`, `FR-48`–`FR-49`)
10. ระบบติดต่อและช่วยเหลือผู้ใช้งาน (`FR-45`)

---

## 7. Process, Methods, and Tools (Phase 1)

### 7.1 Process (กระบวนการทำงาน)
* **Agile Scrum Methodology:** ดำเนินการพัฒนาโดยแบ่งการทำงานออกเป็นรอบสั้น ๆ (Sprints) เพื่อให้ทีมสามารถตรวจสอบความคืบหน้า ปรับเปลี่ยนแผนงาน และส่งมอบงานได้อย่างยืดหยุ่น โดยใน **Sprint 1** เน้นกระบวนการเริ่มต้น ได้แก่ การเก็บรวบรวมความต้องการ (Requirement Collection) การวิเคราะห์ระบบ การเขียน TOR และการวางแผน Backlog

### 7.2 Methods (วิธีการดำเนินงาน)
* **Requirement Engineering:** ทำการสัมภาษณ์ผู้ใช้งานจริง (คนนอกกลุ่ม) เพื่อเก็บรวบรวมความต้องการทั้งแบบ Functional และ Non-Functional นำมาวิเคราะห์ จัดกลุ่ม และจัดทำเป็นเอกสารข้อกำหนดโครงการ (TOR)
* **Backlog Grooming & Sprint Planning:** แปลงความต้องการทั้งหมดให้อยู่ในรูปของ User Stories กำหนดรายละเอียดงาน (Work Items) จัดลำดับความสำคัญ และวางแผนงานลงใน Sprint Backlog (`Sprint 00` และ `Sprint 01`)

### 7.3 Tools (เครื่องมือที่ใช้)
* **GitHub (Issues & Milestones):** ใช้สำหรับบริหารจัดการ Product Backlog, ติดตามสถานะงาน (Task Tracking) และวางแผน Sprint Backlog
* **GitHub Repository & Markdown:** ใช้สำหรับจัดเก็บเอกสารรายงานโครงการ (`README.md`, `TOR.md`) และเชิญอาจารย์/TA เข้าร่วมตรวจสอบ
* **YouTube:** ใช้สำหรับอัปโหลดและเผยแพร่วิดีโอบันทึกการสัมภาษณ์เก็บ Requirement รวมถึงวิดีโอบันทึกการประชุมสรุปผลงาน (Retrospective)
* **Figma:** สำหรับวางแนวทางออกแบบหน้าจอและสร้างต้นแบบระบบ
* **Visual Studio Code:** สำหรับเขียนและจัดการเอกสารและซอร์สโค้ด

---

## 8. สรุปขั้นตอนการเก็บ Requirement และการประชุม Retrospective Phase 1

### 8.1 สรุปขั้นตอนการเก็บ Requirement (Requirement Collection Summary)
1. **เตรียมหัวข้อและชุดคำถาม:** ทีมกำหนดกรอบหัวข้อเว็บแอปพลิเคชันจองบัตรกิจกรรมและเตรียมคำถามปลายเปิดครอบคลุมมุมมองทั้งผู้ซื้อบัตรและผู้จัดงาน
2. **สัมภาษณ์ผู้ใช้งานจริงนอกกลุ่ม:** ดำเนินการสัมภาษณ์เพื่อสอบถามปัญหาที่เคยเจอจากการจองบัตรออนไลน์ (เช่น เว็บค้างตอนกดบัตร, แย่งที่นั่งซ้ำ, บัตรผี, การคืนเงิน) รวมถึงความต้องการด้านหน้าตาและโทนสี (Oat Milk / Monday Blue / Candy Apple)
3. **วิเคราะห์และจัดทำข้อกำหนด:** ถอดความจากบทสัมภาษณ์มาแยกเป็น Functional Requirements (`FR-01`–`FR-49`), Non-Functional Requirements (`NFR-01`–`NFR-17`), UI Requirements (`UI-01`–`UI-13`) และสรุปเป็นเอกสาร [`TOR.md`](./TOR.md) พร้อมแตกงานลงใน GitHub Issues

* **Requirements Interview YouTube Link:** https://youtu.be/-l-ONZ0Nss0

### 8.2 สรุปการประชุม Retrospective Phase 1
* **สิ่งที่ทำได้ดี (What Went Well):**
  * ทีมได้ความต้องการจากผู้ใช้งานจริงนอกกลุ่มอย่างครบถ้วนและชัดเจนทั้งฝั่งผู้ซื้อและผู้ดูแลระบบ
  * สามารถแปลง Requirement ทั้งหมดเป็น User Stories และจัดลง Milestones (`Sprint 00` และ `Sprint 01`) บน GitHub ได้อย่างเป็นระบบ
* **ปัญหาและอุปสรรคที่พบ (Challenges):**
  * ขอบเขตความต้องการมีจำนวนมาก (เกือบ 80 ข้อกำหนด) จึงต้องใช้เวลาในการจัดกลุ่มและจัดลำดับความสำคัญให้เหมาะสมกับระยะเวลาของแต่ละ Sprint
* **แนวทางปรับปรุงสำหรับ Phase 2 (Action Items):**
  * เริ่มออกแบบต้นแบบหน้าจอใน Figma และแผนภาพสถาปัตยกรรม/Use Case ด้วย Mermaid เพื่อให้ทีมเห็นภาพตรงกันก่อนลงมือเขียนโค้ดจริง
  * กำหนดกติกาการใช้ Git Branch และ Commit Message ให้ชัดเจนใน Phase 2

* **Retrospective Phase 1 YouTube Link:** https://youtu.be/y5xg2nNoAHg?si=fjigoSF_WZ-VYavK

---

## 9. ภาพหน้าจอและคำอธิบาย GitHub Backlog (Phase 1 Evidence)

### 9.1 Product Backlog (GitHub Issues / User Stories)
แสดงรายการ Work Items และ User Stories ทั้งหมดที่แตกออกมาจาก Requirement ของโครงการ พร้อมป้ายกำกับ (Labels) และผู้รับผิดชอบ (Assignees) เพื่อใช้ติดตามงานตลอดโครงการ:

<img width="1169" height="673" alt="github_issues_sprint1" src="https://github.com/user-attachments/assets/7ddc3fe2-00d3-478d-b959-b1d65871ed2b" />

### 9.2 Sprint Backlog (GitHub Milestones)
แสดงการวางแผนกำหนดกรอบเวลา (Due Date) และแบ่งกลุ่ม Issue เข้าสู่แต่ละ Milestone ได้แก่ **Sprint 00** (การเตรียมโปรเจกต์และเก็บ Requirement) และ **Sprint 01** (การจัดทำรายงาน วิเคราะห์ระบบ และเตรียมต้นแบบ) พร้อมแถบเปอร์เซ็นต์ความคืบหน้า:

<img width="1251" height="201" alt="github_milestone_sprint_00" src="https://github.com/user-attachments/assets/ca22d6f0-1266-4855-a9d6-4aa812358c84" />
<img width="1374" height="661" alt="github_milestone_sprint_01" src="https://github.com/user-attachments/assets/3e4486d3-2441-4588-bbab-3d94db1ce3fa" />

### 9.3 ตัวอย่างรายละเอียดของ Issue (Example Detail Issue)
แสดงโครงสร้างรายละเอียดภายใน Issue ที่ระบุคำอธิบายงาน (Description), รายการตรวจสอบความสำเร็จ (Acceptance Criteria / Checklist), ผู้รับผิดชอบ (Assignee), ป้ายกำกับ (Label) และ Milestone ที่สังกัดอย่างชัดเจน:

<img width="1324" height="681" alt="github_issues_detail" src="https://github.com/user-attachments/assets/39a561e2-9c11-4481-9f22-91c0aa340c43" />

---

## เอกสารรายงานเฟสถัดไป (Next Phase Reports)
* **Phase 2 — Initial Design and Prototype:** [`docs/phase-2-report.md`](./docs/phase-2-report.md)
* **Phase 3 — Implementation, Unit Testing, Coverage & Profiling:** [`docs/phase-3-report.md`](./docs/phase-3-report.md)
* **Phase 4 — Final Product, UI Testing, Profiling Comparison & CI/CD:** [`docs/phase-4-report.md`](./docs/phase-4-report.md)
