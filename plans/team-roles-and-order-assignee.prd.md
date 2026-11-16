# Команда, ролі та виконавець замовлення — MVP

## Problem Statement

CRM спочатку розрахована на одного адміністратора. Команда не має визначених
прав доступу, а замовлення не містять відповідального виконавця. Власнику важко
зрозуміти, кому призначена робота, і надати співробітникам доступ до статусів,
не дозволивши змінювати роботи, ціни та інші дані.

Потрібна проста командна робота для автомалярки з можливістю надалі підключати
інші автомалярки без змішування їхніх даних.

## Solution

Використовуємо Clerk Organizations: одна організація відповідає одній автомалярці.
Командою, запрошеннями й стандартними ролями керуємо через наявні компоненти Clerk.
Нових механізмів реєстрації, власної системи запрошень або спеціальних ролей не додаємо.

Дві ролі:

| Можливість | Адміністратор (`org:admin`) | Виконавець (`org:member`) |
| --- | --- | --- |
| Перегляд усіх замовлень своєї автомалярки | Так | Так |
| Перегляд робіт, цін, суми, схеми кузова та історії | Так | Так, лише читання |
| Створення й редагування клієнтів, авто, заявок і замовлень | Так | Ні |
| Запрошення, видалення учасників і керування ролями | Так | Ні |
| Призначення та зміна виконавця | Так | Ні |
| Статуси замовлень | У межах поточних правил CRM | Лише наступний крок: «У роботі → Готово → Видано» |
| Планові дати, виправлення фактичних дат, повернення статусу назад | Так, з наявною валідацією та причиною зміни | Ні |

При створенні замовлення, зокрема із заявки, адміністратор обов’язково вибирає
одного активного учасника поточної автомалярки. Можна призначити адміністратора
або виконавця. Призначення не обмежує видимість: виконавець бачить **усі**
замовлення своєї автомалярки й може просувати статус будь-якого з них.

Виконавця видно у формі, списку замовлень, картці дошки та друкованому документі.
Перепризначення відображається в наявній історії змін. Ціни та склад робіт від
призначення не залежать.

Погоджені з користувачем три модулі:

1. **Команда та доступ.** Єдиний серверний контекст організації, користувача,
   ролі й учасників; перевірки прав і доступ лише до даних своєї автомалярки.
   Керування командою використовує стандартний інтерфейс Clerk.
2. **Виконавець замовлення.** Перевірка учасника, збереження призначення,
   відображення у формі, списку, дошці, друці та історії; збереження старих даних.
3. **Робочий режим виконавця.** Перегляд замовлень без редагування даних і проста
   дія переходу до наступного статусу з серверною перевіркою правил.

Доменні правила доступу, допустимості призначення та переходів статусу мають
невеликі інтерфейси й тестуються окремо від Clerk UI. Організація береться з
перевіреної серверної сесії, а не з полів форми. Роль та активне членство
перевіряються на сервері; приховані кнопки лише пояснюють доступні дії.

## User Stories

1. As an administrator, I want an автомалярка represented by a Clerk Organization, so that its team and data have a common boundary.
2. As an administrator, I want to invite employees using Clerk, so that I do not maintain a separate invitation system.
3. As an administrator, I want to assign the administrator or executor role, so that each team member has predictable rights.
4. As an administrator, I want to remove a team member, so that a former employee cannot access the автомалярка.
5. As a team member, I want to select my active автомалярка, so that I work with the correct orders.
6. As a team member, I want data from different автомалярки kept separate, so that I cannot see or change another organization’s records.
7. As a signed-in user without an active organization, I want a clear route to selecting or creating an автомалярка, so that I can continue without an unexplained access error.
8. As the existing owner, I want my customers, vehicles, requests, orders and history preserved, so that team access does not lose current work.
9. As the existing owner, I want only my organization to receive the current database, so that another organization cannot claim existing records.
10. As an administrator, I want to choose one executor when creating an order, so that responsibility is explicit from the beginning.
11. As an administrator, I want executor selection when converting a request into an order, so that conversion follows the same rules as direct creation.
12. As an administrator, I want every active member, including administrators, available for assignment, so that our small team can allocate work flexibly.
13. As an administrator, I want assignment to a removed member or member of another organization rejected, so that orders reference valid participants.
14. As an administrator, I want to reassign an existing order, so that I can respond to a changed workload.
15. As a team member, I want the executor visible in the order list and board card, so that I can identify responsibility quickly.
16. As a team member, I want the executor visible in the order view and printout, so that responsibility remains clear when sharing a saved order.
17. As an administrator, I want old orders with no executor preserved as unassigned, so that migration does not invent historical assignments.
18. As an administrator, I want an order to keep its historical executor name after that person leaves, so that existing records remain understandable.
19. As a team member, I want executor changes recorded with previous and new values, so that reassignment is traceable.
20. As a team member, I want new history events to identify the acting user, so that actions by different employees are distinguishable.
21. As an executor, I want to view all orders of my автомалярка, so that I can coordinate with colleagues.
22. As an executor, I want to read descriptions, work items, prices, dates and body diagrams without editing them, so that I have the context needed for the job.
23. As an executor, I want a simple action to mark an order ready, so that progress is visible to the team.
24. As an executor, I want a simple action to mark a ready order delivered, so that completion is recorded.
25. As an executor, I want the next status action available only where valid, so that I cannot skip a required step or move backward.
26. As an administrator, I want corrections and backward transitions to remain under my control with the existing reason requirement, so that the history stays meaningful.
27. As a team member, I want stale edits rejected, so that two open windows cannot silently overwrite each other’s changes.
28. As a team member, I want organization switching to replace both visible data and cached queries, so that I do not mistake one shop’s orders for another’s.
29. As an executor, I want role-appropriate controls on mobile as well as desktop, so that I can update work from my phone.
30. As an administrator, I want permission restrictions enforced on direct server requests, so that client-side manipulation cannot change protected data.

## Testing Decisions

The user approved unit tests plus persistence and UI checks for all three modules.
Tests should verify user-visible behavior and permission boundaries, not internal
function calls or component structure.

Use the existing repository tests against temporary SQLite databases, workflow
validation tests, form/component tests, and browser fixtures as prior art.
Stub Clerk membership responses in automated tests; do not send real invitations
or change live team membership as a side effect of testing.

Required checks:

- Role matrix: an executor cannot invoke administrative mutations directly.
- A removed member, unknown role or missing organization cannot access protected CRM data.
- Forged organization identifiers cannot redirect a read, write, history or print request.
- Organization A and B remain isolated on reads, mutations, cache keys and switching.
- Current data is transferred or bound only to the existing owner’s organization;
  migrations are repeatable and do not fabricate assignments or history authors.
- Direct order creation and conversion require an active assignee from the current organization.
- Both administrators and executors can be assigned; pending invitations do not count as active members.
- Removed members cannot receive new assignments; their historical names remain readable.
- Reassignment persists, produces one history event, preserves prices and respects the existing revision guard.
- Existing unassigned orders remain readable, printable and editable by administrators
  without a forced bulk assignment. An administrator may assign them manually.
- Executor reads include all orders of the current organization, regardless of assignee.
- Executor actions allow only adjacent forward transitions; crafted requests cannot
  skip steps, move backward, edit plans, change existing facts or alter priced work.
- New factual dates required by a forward transition are recorded in Kyiv business
  time on the server, while previously recorded factual dates are preserved.
- A legacy order missing prerequisite factual dates needs administrative correction
  before an executor can move it forward; dates must not be invented by migration.
- Status updates and history records commit together; failed updates leave both unchanged.
- The UI explains unavailable actions and prevents duplicate submissions.
- Assignee labels and permission-specific views remain readable on mobile and desktop.
- Type checking, linting and relevant existing CRM tests pass; unrelated existing
  lint warnings are reported separately.

## Out of Scope

- A manager role, custom Clerk roles or a permission-constructor interface.
- Multiple executors on one order or separate assignees for individual work items.
- Approval workflows, confirmation chains or approval of every status transition.
- Assignment-driven pricing, wages, commissions, time tracking or workload planning.
- Restricting executors to only their assigned orders.
- Hiding prices from executors; they are readable but not editable.
- An executor editing order content, plans, existing factual dates or assignments.
- A new authentication provider or a custom invitation/email-delivery system.
- Sending invitations automatically during implementation or testing.
- SaaS billing, subscriptions, limits, organization analytics or a separate management platform.
- Recovering missing historical assignees or authors from old records.
- A wholesale database-platform migration unrelated to this feature.

## Further Notes

- User decisions: two roles; executor access to all orders of its автомалярка;
  Clerk Organizations; one mandatory assignee on new orders; any active member
  eligible; executor status transitions forward only; simplest useful first version.
- Administrator permissions are checked on every protected server action. The
  active organization and membership also scope reads and print documents.
- Use built-in `org:admin` and `org:member`, presented as «Адміністратор» and
  «Виконавець». Do not silently grant unsupported roles administrative access.
- A pending invitation becomes assignable only after the person joins the organization.
- Organization/member removal must be reflected by server access checks rather
  than trusting an old client-side role indefinitely.
- Executor transitions are sequential. Marking ready records a ready date; marking
  delivered records a delivery date. Existing chronology checks still apply.
- Old orders retain a visible «Не призначено» value until an administrator chooses
  an assignee. Removal of a participant never silently reassigns their orders.
- The existing owner may bind the current data to one organization; other
  organizations start with separate data. Organization membership alone does not
  confer ownership of the old shared database.
- The working tree contains unfinished implementation changes from before the
  planning phase. They are not a completed or verified feature. During execution,
  reconcile them with this PRD and preserve the earlier history improvements.
- Product scope and the three test categories have been confirmed by the user.
