import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("pesquisa_valor", ["vlrProduto", "vlrFilial"], {})
@Index("vlr_data_de", ["vlrDataDe"], {})
@Entity("cf_valor", { schema: "cf_teste" })
export class CfValorEntity {
  @PrimaryGeneratedColumn({ type: "int", name: "vlr_id" })
  vlrId: number;

  @Column("bigint", { name: "vlr_produto", nullable: true })
  vlrProduto: number | null;

  @Column("date", { name: "vlr_data_de", nullable: true })
  vlrDataDe: string | null;

  @Column("date", { name: "vlr_data_ate", nullable: true })
  vlrDataAte: string | null;

  @Column("int", { name: "vlr_idcomercial", nullable: true })
  vlrIdcomercial: number | null;

  @Column("varchar", { name: "vlr_empresa", nullable: true, length: 15 })
  vlrEmpresa: number | null;

  @Column("varchar", { name: "vlr_filial", nullable: true, length: 15 })
  vlrFilial: number | null;

  @Column("varchar", { name: "vlr_usuario", nullable: true, length: 15 })
  vlrUsuario: number | null;

  @Column("text", { name: "vlr_valores", nullable: true })
  vlrValores: string | null;

  @Column("varchar", { name: "vlr_hora", nullable: true, length: 20 })
  vlrHora: string | null;

}
